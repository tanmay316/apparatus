import {
  collection, deleteDoc, doc, getDoc, getDocs, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
  where, addDoc, type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logAdminAction } from '@/services/admin';

export type ShowcaseKind = 'product' | 'gear' | 'plan' | 'event' | 'challenge' | 'clan' | 'service' | 'offer';
export type ShowcaseTarget = 'url' | 'event' | 'challenge' | 'clan' | 'plan';

export const SHOWCASE_KINDS: { id: ShowcaseKind; label: string; target: ShowcaseTarget }[] = [
  { id: 'product', label: 'Product', target: 'url' },
  { id: 'gear', label: 'Gear', target: 'url' },
  { id: 'service', label: 'Service / coaching', target: 'url' },
  { id: 'offer', label: 'Offer', target: 'url' },
  { id: 'plan', label: 'Training plan', target: 'plan' },
  { id: 'event', label: 'Event', target: 'event' },
  { id: 'challenge', label: 'Challenge', target: 'challenge' },
  { id: 'clan', label: 'Clan / community', target: 'clan' },
];

export interface ShowcaseItem {
  id: string;
  ownerId: string;
  ownerName?: string;
  ownerPhoto?: string;
  kind: ShowcaseKind;
  title: string;
  description?: string;
  imageUrl?: string;
  priceText?: string;
  targetType: ShowcaseTarget;
  targetId?: string;
  url?: string;
  active: boolean;
  featured?: boolean;
  clicks?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type ShowcaseInput = Pick<ShowcaseItem, 'kind' | 'title' | 'description' | 'imageUrl' | 'priceText' | 'targetType' | 'targetId' | 'url' | 'active'>;

const byNewest = (a: { createdAt?: Timestamp }, b: { createdAt?: Timestamp }) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0);
const toItems = (docs: { id: string; data: () => any }[]) => docs.map(d => ({ id: d.id, ...d.data() } as ShowcaseItem));

export async function listShowcase(): Promise<ShowcaseItem[]> {
  const snap = await getDocs(query(collection(db, 'market_items'), where('active', '==', true), limit(120)));
  return toItems(snap.docs).sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || byNewest(a, b));
}

export async function listMyShowcase(uid: string): Promise<ShowcaseItem[]> {
  const snap = await getDocs(query(collection(db, 'market_items'), where('ownerId', '==', uid), limit(100)));
  return toItems(snap.docs).sort(byNewest);
}

export async function listAllShowcase(): Promise<ShowcaseItem[]> {
  const snap = await getDocs(query(collection(db, 'market_items'), orderBy('createdAt', 'desc'), limit(200)));
  return toItems(snap.docs);
}

function clean(input: ShowcaseInput) {
  const isUrl = input.targetType === 'url';
  return {
    kind: input.kind,
    title: input.title.trim().slice(0, 80),
    description: (input.description || '').trim().slice(0, 1000),
    imageUrl: input.imageUrl || '',
    priceText: (input.priceText || '').trim().slice(0, 40),
    targetType: input.targetType,
    targetId: isUrl ? '' : input.targetId || '',
    url: isUrl ? (input.url || '').trim().slice(0, 300) : '',
    active: input.active,
  };
}

export async function createShowcaseItem(owner: { uid: string; name: string; photo: string }, input: ShowcaseInput) {
  await addDoc(collection(db, 'market_items'), {
    ...clean(input),
    ownerId: owner.uid, ownerName: owner.name.slice(0, 60), ownerPhoto: owner.photo.length <= 600 ? owner.photo : '',
    featured: false, clicks: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function updateShowcaseItem(item: ShowcaseItem, input: ShowcaseInput) {
  await setDoc(doc(db, 'market_items', item.id), {
    ...clean(input),
    ownerId: item.ownerId, ownerName: item.ownerName || '', ownerPhoto: item.ownerPhoto || '',
    featured: !!item.featured, clicks: item.clicks || 0, createdAt: item.createdAt || serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export const deleteShowcaseItem = async (id: string) => {
  await deleteDoc(doc(db, 'market_items', id));
  void import('@/lib/live-deletions').then(m => m.announceDeletion('showcase', id));
};

export function recordShowcaseClick(id: string) {
  updateDoc(doc(db, 'market_items', id), { clicks: increment(1) }).catch(() => undefined);
}

export async function adminUpdateShowcase(item: ShowcaseItem, patch: Partial<Pick<ShowcaseItem, 'active' | 'featured'>>) {
  await updateDoc(doc(db, 'market_items', item.id), { ...patch, updatedAt: serverTimestamp() });
  await logAdminAction('market_item.update', 'market_item', item.id, { label: item.title, details: JSON.stringify(patch) });
}

export async function adminDeleteShowcase(item: ShowcaseItem) {
  await deleteShowcaseItem(item.id);
  await logAdminAction('market_item.delete', 'market_item', item.id, { label: item.title });
}

// ─── Listing permission ────────────────────────────────────────

export interface MarketPartner { uid: string; name: string; active: boolean; createdAt?: Timestamp }

export type RequestKind = 'brand' | 'gym' | 'coach' | 'community' | 'organizer' | 'other';
export interface MarketRequest {
  uid: string;
  name?: string;
  business: string;
  kind: RequestKind;
  contactEmail: string;
  contactPhone?: string;
  website?: string;
  message?: string;
  status: 'pending' | 'approved' | 'declined';
  adminNote?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** Live listing permission for the signed-in user (undefined while loading). */
export function subscribeMarketPartner(uid: string, cb: (p: MarketPartner | null) => void) {
  return onSnapshot(doc(db, 'market_partners', uid), s => cb(s.exists() && s.data().active ? (s.data() as MarketPartner) : null), () => cb(null));
}

export async function getMyMarketRequest(uid: string): Promise<MarketRequest | null> {
  const s = await getDoc(doc(db, 'market_requests', uid));
  return s.exists() ? (s.data() as MarketRequest) : null;
}

export async function sendMarketRequest(uid: string, input: Omit<MarketRequest, 'uid' | 'status' | 'createdAt' | 'updatedAt' | 'adminNote'>, existing: MarketRequest | null) {
  await setDoc(doc(db, 'market_requests', uid), {
    uid,
    name: (input.name || '').trim().slice(0, 60),
    business: input.business.trim().slice(0, 80),
    kind: input.kind,
    contactEmail: input.contactEmail.trim().slice(0, 120),
    contactPhone: (input.contactPhone || '').trim().slice(0, 20),
    website: (input.website || '').trim().slice(0, 200),
    message: (input.message || '').trim().slice(0, 1000),
    status: 'pending',
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function listMarketRequests(): Promise<MarketRequest[]> {
  const snap = await getDocs(query(collection(db, 'market_requests'), limit(200)));
  return snap.docs.map(d => ({ ...(d.data() as MarketRequest), uid: d.id })).sort(byNewest);
}

export async function listMarketPartners(): Promise<MarketPartner[]> {
  const snap = await getDocs(query(collection(db, 'market_partners'), limit(200)));
  return snap.docs.map(d => ({ ...(d.data() as MarketPartner), uid: d.id })).sort(byNewest);
}

export async function setMarketPartner(uid: string, name: string, active: boolean, adminUid: string) {
  await setDoc(doc(db, 'market_partners', uid), { uid, name: name.slice(0, 80), active, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true });
  if (active) {
    await updateDoc(doc(db, 'market_requests', uid), { status: 'approved', updatedAt: serverTimestamp() }).catch(() => undefined);
    await addDoc(collection(db, 'app_notifications'), {
      userId: uid, senderId: adminUid, type: 'market', read: false, link: '/seller',
      title: 'You can now list on the Marketplace',
      body: 'Add your products, plans, events or community from My listings.',
      createdAt: serverTimestamp(),
    }).catch(() => undefined);
  }
  await logAdminAction(active ? 'market_partner.grant' : 'market_partner.revoke', 'market_partner', uid, { label: name });
  if (!active) {
    const items = await getDocs(query(collection(db, 'market_items'), where('ownerId', '==', uid), limit(200)));
    await Promise.all(items.docs.map(d => updateDoc(d.ref, { active: false, updatedAt: serverTimestamp() })));
  }
}

export async function declineMarketRequest(uid: string, note: string) {
  await updateDoc(doc(db, 'market_requests', uid), { status: 'declined', adminNote: note.slice(0, 300), updatedAt: serverTimestamp() });
  await logAdminAction('market_request.decline', 'market_request', uid, { details: note });
}
