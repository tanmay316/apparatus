import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, increment, orderBy, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Community, AppEvent, EventRegistration, EventReview } from '@/types';

// ─── Communities ──────────────────────────────────────────────────

export async function createCommunity(community: Omit<Community, 'id' | 'createdAt' | 'membersCount' | 'isVerified'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'communities'), {
    ...community,
    membersCount: 1,
    isVerified: false, // Requires admin approval
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCommunity(id: string): Promise<Community | null> {
  const snap = await getDoc(doc(db, 'communities', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Community;
}

export async function getVerifiedCommunities(): Promise<Community[]> {
  const q = query(
    collection(db, 'communities'),
    where('isVerified', '==', true),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Community));
}

export async function getPendingCommunities(): Promise<Community[]> {
  const q = query(collection(db, 'communities'), where('isVerified', '==', false));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Community));
}

export async function approveCommunity(id: string): Promise<void> {
  await updateDoc(doc(db, 'communities', id), { isVerified: true });
}

export async function rejectCommunity(id: string): Promise<void> {
  await deleteDoc(doc(db, 'communities', id));
}

// ─── Events ───────────────────────────────────────────────────────

export async function createEvent(event: Omit<AppEvent, 'id' | 'createdAt' | 'status' | 'stats'>): Promise<string> {
  // If no community, it needs Admin approval ('pending'). If in community, needs leader approval ('pending').
  const docRef = await addDoc(collection(db, 'events'), {
    ...event,
    status: 'pending',
    stats: { registeredCount: 0, checkInCount: 0, views: 0 },
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getEvent(id: string): Promise<AppEvent | null> {
  const snap = await getDoc(doc(db, 'events', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as AppEvent;
}

export async function getPublishedEvents(): Promise<AppEvent[]> {
  const q = query(
    collection(db, 'events'),
    where('status', '==', 'published'),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent));
}

export async function getPendingEvents(): Promise<AppEvent[]> {
  const q = query(collection(db, 'events'), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent));
}

export async function getEventsByCommunity(communityId: string): Promise<AppEvent[]> {
  const q = query(
    collection(db, 'events'),
    where('communityId', '==', communityId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent));
}

export async function updateEventStatus(id: string, status: AppEvent['status']): Promise<void> {
  await updateDoc(doc(db, 'events', id), { status });
}

export async function registerForEvent(registration: Omit<EventRegistration, 'id' | 'purchasedAt'>): Promise<string> {
  // Add registration record
  const docRef = await addDoc(collection(db, 'event_registrations'), {
    ...registration,
    purchasedAt: serverTimestamp(),
  });
  
  // Increment event registeredCount only if fully registered
  if (registration.status === 'registered') {
    await updateDoc(doc(db, 'events', registration.eventId), {
      'stats.registeredCount': increment(1)
    });
    
    const eventDoc = await getDoc(doc(db, 'events', registration.eventId));
    const eventData = eventDoc.data();
    
    await addDoc(collection(db, 'activities'), {
      userId: registration.userId,
      userName: registration.userName,
      userPhoto: registration.userPhoto,
      type: 'event_join',
      summary: `Registered for ${eventData?.title || 'an event'}`,
      details: {
        eventId: registration.eventId,
        eventTitle: eventData?.title || 'an event'
      },
      visibility: 'public',
      likesCount: 0,
      commentsCount: 0,
      createdAt: serverTimestamp()
    });
  }
  
  return docRef.id;
}

export async function getEventRegistrations(eventId: string): Promise<EventRegistration[]> {
  const q = query(collection(db, 'event_registrations'), where('eventId', '==', eventId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventRegistration));
}

export async function getUserEventRegistrations(userId: string): Promise<EventRegistration[]> {
  const q = query(collection(db, 'event_registrations'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventRegistration));
}

export async function getEventsByIds(eventIds: string[]): Promise<AppEvent[]> {
  if (!eventIds.length) return [];
  // Firestore 'in' query supports max 10 values, so chunk them if necessary.
  const chunks = [];
  for (let i = 0; i < eventIds.length; i += 10) {
    chunks.push(eventIds.slice(i, i + 10));
  }
  
  const results: AppEvent[] = [];
  for (const chunk of chunks) {
    const q = query(collection(db, 'events'), where('__name__', 'in', chunk));
    const snap = await getDocs(q);
    results.push(...snap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent)));
  }
  return results;
}

export async function checkInUser(registrationId: string, eventId: string): Promise<void> {
  await updateDoc(doc(db, 'event_registrations', registrationId), { status: 'checked_in' });
  await updateDoc(doc(db, 'events', eventId), {
    'stats.checkInCount': increment(1)
  });
}

export async function cancelRegistration(registrationId: string, eventId: string, wasWaitlisted: boolean = false): Promise<void> {
  await updateDoc(doc(db, 'event_registrations', registrationId), { status: 'cancelled' });
  if (!wasWaitlisted) {
    await updateDoc(doc(db, 'events', eventId), {
      'stats.registeredCount': increment(-1)
    });
  }
}

export interface EventMessage {
  id?: string;
  eventId: string;
  userId: string;
  userName: string;
  userPhoto: string;
  message: string;
  createdAt: Timestamp | null;
}

export async function addEventMessage(msg: Omit<EventMessage, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, 'event_messages'), {
    ...msg,
    createdAt: serverTimestamp()
  });
}

export async function getEventMessages(eventId: string): Promise<EventMessage[]> {
  const q = query(
    collection(db, 'event_messages'),
    where('eventId', '==', eventId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventMessage));
}

export async function addEventReview(review: Omit<EventReview, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, 'event_reviews'), {
    ...review,
    createdAt: serverTimestamp()
  });
}

export async function getEventReviews(eventId: string): Promise<EventReview[]> {
  const q = query(
    collection(db, 'event_reviews'),
    where('eventId', '==', eventId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventReview));
}
