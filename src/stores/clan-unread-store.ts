import { create } from 'zustand';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface ClanUnread {
  /** Newest message is from someone else and arrived after I last read the chat. */
  unread: boolean;
  /** Someone @mentioned me after I last read the chat. */
  mentioned: boolean;
}

interface ClanUnreadState {
  byClan: Record<string, ClanUnread>;
  /** Read times recorded on this device before the server copy arrives. */
  localReads: Record<string, number>;
  setByClan: (byClan: Record<string, ClanUnread>) => void;
}

export const useClanUnreadStore = create<ClanUnreadState>(set => ({
  byClan: {},
  localReads: {},
  setByClan: byClan => set({ byClan }),
}));

export const useClanUnread = (clanId: string | undefined): ClanUnread =>
  useClanUnreadStore(s => (clanId && s.byClan[clanId]) || NONE);

/** Summary for the Community tab: '@' beats the plain dot. */
export const useClansBadge = (): 'mention' | 'unread' | null =>
  useClanUnreadStore(s => {
    const all = Object.values(s.byClan);
    if (all.some(c => c.mentioned)) return 'mention';
    return all.some(c => c.unread) ? 'unread' : null;
  });

const NONE: ClanUnread = { unread: false, mentioned: false };
const WRITE_DELAY_MS = 1500;
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

/** Marks a clan chat as read now (instantly on this device, then one small server write). */
export function markClanChatRead(clanId: string, uid: string) {
  const now = Date.now();
  useClanUnreadStore.setState(s => ({
    localReads: { ...s.localReads, [clanId]: now },
    byClan: s.byClan[clanId] ? { ...s.byClan, [clanId]: NONE } : s.byClan,
  }));
  if (pendingWrites.has(clanId)) return;
  pendingWrites.set(clanId, setTimeout(() => {
    pendingWrites.delete(clanId);
    setDoc(doc(db, 'clan_reads', `${clanId}_${uid}`), { clanId, userId: uid, lastReadAt: serverTimestamp() })
      .catch(err => console.warn('Could not save clan read marker:', err));
  }, WRITE_DELAY_MS));
}
