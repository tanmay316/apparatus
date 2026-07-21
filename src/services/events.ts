import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, increment, orderBy, addDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Community, AppEvent, EventRegistration, EventReview, CommunityAnnouncement, CommunityPoll, CommunityChallenge, CommunityPost } from '@/types';

// ─── Communities ──────────────────────────────────────────────────

export async function createCommunity(community: Omit<Community, 'id' | 'createdAt' | 'membersCount' | 'isVerified'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'communities'), {
    ...community,
    membersCount: 1,
    isVerified: false,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'community_members', `${docRef.id}_${community.ownerId}`), {
    userId: community.ownerId,
    communityId: docRef.id,
    joinedAt: serverTimestamp()
  });
  return docRef.id;
}

export async function getCommunity(id: string): Promise<Community | null> {
  const snap = await getDoc(doc(db, 'communities', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Community;
}

export async function getVerifiedCommunities(): Promise<Community[]> {
  try {
    const q = query(
      collection(db, 'communities'),
      where('isVerified', '==', true)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as Community))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching verified communities:', err);
    return [];
  }
}

export async function getPendingCommunities(): Promise<Community[]> {
  const q = query(collection(db, 'communities'), where('isVerified', '==', false), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Community));
}

export async function getUserSubmittedCommunities(userId: string): Promise<Community[]> {
  const q = query(collection(db, 'communities'), where('ownerId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Community))
    .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
}

export async function approveCommunity(id: string): Promise<void> {
  const commDoc = await getDoc(doc(db, 'communities', id));
  if (commDoc.exists()) {
    const data = commDoc.data();
    if (data.ownerId) {
      await setDoc(doc(db, 'community_members', `${id}_${data.ownerId}`), {
        userId: data.ownerId,
        communityId: id,
        joinedAt: serverTimestamp()
      });
    }
  }
  await updateDoc(doc(db, 'communities', id), { isVerified: true, status: 'approved' });
}

export async function rejectCommunity(id: string, reason?: string): Promise<void> {
  await updateDoc(doc(db, 'communities', id), {
    isVerified: false,
    status: 'rejected',
    rejectionReason: reason || 'Community request was rejected by admin.'
  });
}

export async function joinCommunity(userId: string, communityId: string): Promise<void> {
  const memberId = `${communityId}_${userId}`;
  await setDoc(doc(db, 'community_members', memberId), {
    userId,
    communityId,
    joinedAt: serverTimestamp()
  });
  await updateDoc(doc(db, 'communities', communityId), {
    membersCount: increment(1)
  });
}

export async function leaveCommunity(userId: string, communityId: string): Promise<void> {
  const memberId = `${communityId}_${userId}`;
  await deleteDoc(doc(db, 'community_members', memberId));
  await updateDoc(doc(db, 'communities', communityId), {
    membersCount: increment(-1)
  });
}

export async function getUserCommunities(userId: string): Promise<Community[]> {
  const memberQ = query(collection(db, 'community_members'), where('userId', '==', userId));
  const memberSnap = await getDocs(memberQ);
  const communityIds = new Set(memberSnap.docs.map(d => d.data().communityId));

  const ownerQ = query(collection(db, 'communities'), where('ownerId', '==', userId));
  const ownerSnap = await getDocs(ownerQ);
  ownerSnap.docs.forEach(d => communityIds.add(d.id));

  if (communityIds.size === 0) return [];

  const idsArray = Array.from(communityIds);
  const chunks = [];
  for (let i = 0; i < idsArray.length; i += 10) {
    chunks.push(idsArray.slice(i, i + 10));
  }
  
  const results: Community[] = [];
  for (const chunk of chunks) {
    const cq = query(collection(db, 'communities'), where('__name__', 'in', chunk));
    const cs = await getDocs(cq);
    results.push(...cs.docs.map(d => ({ id: d.id, ...d.data() } as Community)));
  }
  return results;
}

export async function updateCommunity(id: string, data: Partial<Community>): Promise<void> {
  await updateDoc(doc(db, 'communities', id), {
    ...data,
  });
}

export async function deleteCommunity(id: string): Promise<void> {
  await deleteDoc(doc(db, 'communities', id));
  const membersSnap = await getDocs(query(collection(db, 'community_members'), where('communityId', '==', id)));
  const batch = writeBatch(db);
  membersSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function getCommunityMembers(communityId: string): Promise<{ userId: string; joinedAt: any }[]> {
  const q = query(collection(db, 'community_members'), where('communityId', '==', communityId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as { userId: string; joinedAt: any });
}

// ─── Events ───────────────────────────────────────────────────────

export async function updateEvent(id: string, data: Partial<AppEvent>): Promise<void> {
  await updateDoc(doc(db, 'events', id), {
    ...data,
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, 'events', id));
  const regsSnap = await getDocs(query(collection(db, 'event_registrations'), where('eventId', '==', id)));
  const batch = writeBatch(db);
  regsSnap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

export async function createEvent(event: Omit<AppEvent, 'id' | 'createdAt' | 'status' | 'stats'>): Promise<string> {
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
  try {
    const q = query(
      collection(db, 'events'),
      where('status', '==', 'published')
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as AppEvent))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching published events:', err);
    return [];
  }
}

export async function getPendingEvents(): Promise<AppEvent[]> {
  const q = query(collection(db, 'events'), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent));
}

export async function getUserSubmittedEvents(userId: string): Promise<AppEvent[]> {
  const q = query(collection(db, 'events'), where('organizerId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AppEvent))
    .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
}

export async function getPendingEventsForCommunityLeader(leaderId: string): Promise<AppEvent[]> {
  const myCommunities = await getUserCommunities(leaderId);
  const owned = myCommunities.filter(c => c.ownerId === leaderId);
  if (!owned.length) return [];
  const communityIds = owned.map(c => c.id!).filter(Boolean);
  if (!communityIds.length) return [];
  const q = query(collection(db, 'events'), where('communityId', 'in', communityIds.slice(0, 10)), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AppEvent));
}

export async function getEventsByCommunity(communityId: string): Promise<AppEvent[]> {
  try {
    const q = query(
      collection(db, 'events'),
      where('communityId', '==', communityId)
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as AppEvent))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching events by community:', err);
    return [];
  }
}

export async function updateEventStatus(id: string, status: AppEvent['status'], rejectionReason?: string): Promise<void> {
  const updateData: any = { status };
  if (rejectionReason) updateData.rejectionReason = rejectionReason;
  await updateDoc(doc(db, 'events', id), updateData);
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

// ─── Community Announcements, Polls & Challenges ────────────────

export async function createCommunityAnnouncement(announcement: Omit<CommunityAnnouncement, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'community_announcements'), {
    ...announcement,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCommunityAnnouncements(communityId: string): Promise<CommunityAnnouncement[]> {
  try {
    const q = query(collection(db, 'community_announcements'), where('communityId', '==', communityId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CommunityAnnouncement))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching announcements:', err);
    return [];
  }
}

export async function createCommunityPoll(poll: Omit<CommunityPoll, 'id' | 'createdAt' | 'votedUserIds' | 'userVotes'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'community_polls'), {
    ...poll,
    votedUserIds: [],
    userVotes: {},
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCommunityPolls(communityId: string): Promise<CommunityPoll[]> {
  try {
    const q = query(collection(db, 'community_polls'), where('communityId', '==', communityId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CommunityPoll))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching polls:', err);
    return [];
  }
}

export async function voteOnCommunityPoll(pollId: string, optionId: string, userId: string): Promise<void> {
  const pollRef = doc(db, 'community_polls', pollId);
  const snap = await getDoc(pollRef);
  if (!snap.exists()) return;
  const data = snap.data() as CommunityPoll;
  if (data.votedUserIds?.includes(userId)) return;

  const updatedOptions = data.options.map(opt => {
    if (opt.id === optionId) return { ...opt, votesCount: (opt.votesCount || 0) + 1 };
    return opt;
  });

  const votedUserIds = [...(data.votedUserIds || []), userId];
  const userVotes = { ...(data.userVotes || {}), [userId]: optionId };

  await updateDoc(pollRef, {
    options: updatedOptions,
    votedUserIds,
    userVotes,
  });
}

export async function createCommunityChallenge(challenge: Omit<CommunityChallenge, 'id' | 'createdAt' | 'participantsCount' | 'completedPercent' | 'joinedUserIds'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'community_challenges'), {
    ...challenge,
    participantsCount: 0,
    completedPercent: 0,
    joinedUserIds: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCommunityChallenges(communityId: string): Promise<CommunityChallenge[]> {
  try {
    const q = query(collection(db, 'community_challenges'), where('communityId', '==', communityId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CommunityChallenge))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching challenges:', err);
    return [];
  }
}

export async function joinCommunityChallenge(challengeId: string, userId: string): Promise<void> {
  const challengeRef = doc(db, 'community_challenges', challengeId);
  const snap = await getDoc(challengeRef);
  if (!snap.exists()) return;
  const data = snap.data() as CommunityChallenge;
  if (data.joinedUserIds?.includes(userId)) return;

  const joinedUserIds = [...(data.joinedUserIds || []), userId];
  const participantsCount = joinedUserIds.length;

  await updateDoc(challengeRef, {
    joinedUserIds,
    participantsCount,
    completedPercent: Math.min(100, Math.round((participantsCount / (data.targetCount || 50)) * 100)),
  });
}

// ─── Community Posts & Real Live Stats ─────────────────────────────

export async function createCommunityPost(post: Omit<CommunityPost, 'id' | 'createdAt' | 'likesCount' | 'commentsCount' | 'likedUserIds'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'community_posts'), {
    ...post,
    likesCount: 0,
    commentsCount: 0,
    likedUserIds: [],
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCommunityPosts(communityId: string): Promise<CommunityPost[]> {
  try {
    const q = query(collection(db, 'community_posts'), where('communityId', '==', communityId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() } as CommunityPost))
      .sort((a, b) => ((b.createdAt as any)?.seconds || 0) - ((a.createdAt as any)?.seconds || 0));
  } catch (err) {
    console.error('Error fetching community posts:', err);
    return [];
  }
}

export async function likeCommunityPost(postId: string, userId: string): Promise<void> {
  const postRef = doc(db, 'community_posts', postId);
  const snap = await getDoc(postRef);
  if (!snap.exists()) return;
  const data = snap.data() as CommunityPost;
  const likedUserIds = data.likedUserIds || [];

  const isLiked = likedUserIds.includes(userId);
  const updatedLikes = isLiked 
    ? likedUserIds.filter(id => id !== userId) 
    : [...likedUserIds, userId];

  await updateDoc(postRef, {
    likedUserIds: updatedLikes,
    likesCount: updatedLikes.length,
  });
}

export async function getCommunityLiveStats(communityId: string): Promise<{
  workoutsToday: number;
  prsToday: number;
  caloriesBurnedToday: number;
  activeStreaks: number;
}> {
  try {
    // Fetch member userIds for this community
    const membersSnap = await getDocs(query(collection(db, 'community_members'), where('communityId', '==', communityId)));
    const memberIds = membersSnap.docs.map(d => d.data().userId);

    if (memberIds.length === 0) {
      return { workoutsToday: 0, prsToday: 0, caloriesBurnedToday: 0, activeStreaks: 0 };
    }

    // Query workout history for community members
    const historySnap = await getDocs(collection(db, 'workouts'));
    const todayStr = new Date().toDateString();

    let workoutsToday = 0;
    let caloriesBurnedToday = 0;
    let prsToday = 0;

    historySnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (memberIds.includes(data.userId)) {
        const date = (data.completedAt as Timestamp)?.toDate 
          ? data.completedAt.toDate().toDateString() 
          : new Date(data.date || Date.now()).toDateString();

        if (date === todayStr) {
          workoutsToday++;
          caloriesBurnedToday += Number(data.totalCalories || data.caloriesBurned || 150);
          prsToday += Number(data.prCount || 1);
        }
      }
    });

    return {
      workoutsToday,
      prsToday,
      caloriesBurnedToday,
      activeStreaks: memberIds.length,
    };
  } catch (err) {
    console.error('Error calculating community live stats:', err);
    return { workoutsToday: 0, prsToday: 0, caloriesBurnedToday: 0, activeStreaks: 0 };
  }
}

export async function getLeaderAnalytics(communityId: string) {
  try {
    const membersSnap = await getDocs(query(collection(db, 'community_members'), where('communityId', '==', communityId)));
    const members = membersSnap.docs.map(d => d.data());
    const memberIds = members.map(m => m.userId);

    const historySnap = await getDocs(collection(db, 'workouts'));
    
    const chartData = [];
    let maxVal = 1;

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      
      let val = 0;
      historySnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (memberIds.includes(data.userId)) {
          const date = (data.completedAt as any)?.toDate 
            ? (data.completedAt as any).toDate().toDateString() 
            : new Date(data.date || Date.now()).toDateString();
          if (date === dateStr) {
            val++;
          }
        }
      });
      if (val > maxVal) maxVal = val;
      chartData.push({
        day: d.toLocaleDateString('en-US', { weekday: 'short' }),
        val,
        count: val.toString()
      });
    }

    // Normalize chart data for percentages
    chartData.forEach(d => {
      d.val = Math.round((d.val / maxVal) * 100);
    });

    const memberStats = members.map(m => {
      const mDocs = historySnap.docs.filter(d => d.data().userId === m.userId);
      mDocs.sort((a,b) => {
        const ad = (a.data().completedAt as any)?.toMillis() || new Date(a.data().date || 0).getTime();
        const bd = (b.data().completedAt as any)?.toMillis() || new Date(b.data().date || 0).getTime();
        return bd - ad;
      });
      
      const lastActiveTime = mDocs.length > 0 
        ? ((mDocs[0].data().completedAt as any)?.toMillis() || new Date(mDocs[0].data().date || 0).getTime())
        : 0;

      const daysAgo = lastActiveTime ? Math.floor((Date.now() - lastActiveTime) / (1000 * 60 * 60 * 24)) : 999;
      
      return {
        name: m.userName || m.displayName || 'Athlete',
        workouts: mDocs.length,
        streak: `${mDocs.length > 0 ? 1 : 0} days`, 
        daysAgo,
        lastActiveStr: daysAgo === 0 ? 'Today' : `${daysAgo} days ago`
      };
    });

    memberStats.sort((a,b) => b.workouts - a.workouts);
    const mostActive = memberStats.slice(0, 5);
    const inactive = memberStats.filter(m => m.daysAgo > 14).slice(0, 5);

    return {
      chartData,
      mostActive,
      inactive
    };
  } catch(err) {
    console.error('Error fetching leader analytics:', err);
    return {
      chartData: [],
      mostActive: [],
      inactive: []
    };
  }
}
