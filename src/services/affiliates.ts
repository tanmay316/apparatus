import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { logAdminAction } from '@/services/admin';
import type { AffiliateLink } from '@/lib/affiliates';

export interface AffiliateSettings { amazonTag?: string }

export async function listAffiliateLinks(): Promise<AffiliateLink[]> {
  const snap = await getDocs(query(collection(db, 'affiliate_links'), limit(200)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AffiliateLink));
}

export async function getAffiliateSettings(): Promise<AffiliateSettings> {
  const snap = await getDoc(doc(db, 'admin_settings', 'affiliate'));
  return snap.exists() ? (snap.data() as AffiliateSettings) : {};
}

/** Shared, long-lived cache: the catalogue changes rarely. */
export function useAffiliateCatalog() {
  return useQuery({
    queryKey: ['affiliateCatalog'],
    queryFn: async () => {
      const [links, settings] = await Promise.all([listAffiliateLinks(), getAffiliateSettings().catch((): AffiliateSettings => ({}))]);
      return { links: links.filter(l => l.active), settings };
    },
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
}

export function recordAffiliateClick(id: string) {
  updateDoc(doc(db, 'affiliate_links', id), { clicks: increment(1) }).catch(() => {});
}

export async function saveAffiliateLink(input: Omit<AffiliateLink, 'id' | 'clicks'> & { id?: string }) {
  const data = {
    title: input.title.trim().slice(0, 100),
    url: input.url.trim(),
    imageUrl: (input.imageUrl || '').trim(),
    priceText: (input.priceText || '').trim().slice(0, 30),
    partner: (input.partner || '').trim().slice(0, 40),
    keywords: input.keywords.map(k => k.trim().toLowerCase()).filter(Boolean).slice(0, 30),
    placements: input.placements,
    active: input.active,
    priority: input.priority || 0,
    updatedAt: serverTimestamp(),
  };
  if (input.id) {
    await updateDoc(doc(db, 'affiliate_links', input.id), data);
    await logAdminAction('affiliate.update', 'affiliate_link', input.id, { label: data.title });
    return input.id;
  }
  const ref = await addDoc(collection(db, 'affiliate_links'), { ...data, clicks: 0, createdAt: serverTimestamp() });
  await logAdminAction('affiliate.create', 'affiliate_link', ref.id, { label: data.title });
  return ref.id;
}

export async function deleteAffiliateLink(id: string) {
  await deleteDoc(doc(db, 'affiliate_links', id));
  await logAdminAction('affiliate.delete', 'affiliate_link', id);
}

export async function saveAffiliateSettings(settings: AffiliateSettings) {
  await setDoc(doc(db, 'admin_settings', 'affiliate'), { amazonTag: (settings.amazonTag || '').trim() }, { merge: true });
  await logAdminAction('affiliate.settings', 'admin_settings', 'affiliate', { details: settings.amazonTag || '' });
}
