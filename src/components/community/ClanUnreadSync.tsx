import { useEffect } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useClanUnreadStore, type ClanUnread } from '@/stores/clan-unread-store';
import { clanMessageScope } from '@/services/community';
import { claimBanner, timestampMs } from '@/lib/notification-center';
import { notifyDevice } from '@/utils/notifications';

interface ClanWatch {
  stop: () => void;
  baseline: number;
  latestMs: number;
  latestMine: boolean;
  mentionMs: number;
}

/** "@" pill shown when someone mentioned me in a clan chat I haven't opened since. */
export function MentionBadge({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold leading-none shadow-sm ${className}`}
    >
      @
    </span>
  );
}

/**
 * One app-wide watcher for the green dot / @ badges of every clan I'm in: per clan the newest
 * message and the newest message mentioning me (limit 1 each), compared with my read marker.
 */
export function ClanUnreadSync() {
  const uid = useAuthStore(s => s.user?.uid);

  useEffect(() => {
    const store = useClanUnreadStore;
    if (!uid) {
      store.setState({ byClan: {}, localReads: {} });
      return;
    }

    const watches = new Map<string, ClanWatch>();
    const serverReads: Record<string, number> = {};
    let readsLoaded = false;

    const recompute = () => {
      if (!readsLoaded) return;
      const { localReads } = store.getState();
      const byClan: Record<string, ClanUnread> = {};
      watches.forEach((w, clanId) => {
        const lastRead = Math.max(serverReads[clanId] ?? w.baseline, localReads[clanId] ?? 0);
        byClan[clanId] = {
          unread: !w.latestMine && w.latestMs > lastRead,
          mentioned: w.mentionMs > lastRead,
        };
      });
      store.getState().setByClan(byClan);
    };

    const watchClan = (clanId: string, historyFrom: Timestamp | null, joinedMs: number) => {
      const legacyRead = parseInt(localStorage.getItem(`lastReadChat_${clanId}`) || '0', 10) || 0;
      const w: ClanWatch = { stop: () => {}, baseline: Math.max(legacyRead, joinedMs), latestMs: 0, latestMine: false, mentionMs: 0 };
      const scope = clanMessageScope(clanId, historyFrom);
      let first = true;

      const stopLatest = onSnapshot(
        query(collection(db, 'clan_messages'), ...scope, orderBy('createdAt', 'desc'), limit(1)),
        snap => {
          const d = snap.docs[0];
          const data = d?.data({ serverTimestamps: 'estimate' });
          w.latestMs = timestampMs(data?.createdAt);
          w.latestMine = data?.userId === uid;
          recompute();
          const isNew = !first && snap.docChanges().some(c => c.type === 'added');
          first = false;
          if (!d || !isNew || w.latestMine || snap.metadata.fromCache) return;
          if (window.location.pathname === `/clan/${clanId}/chat`) return;
          if (!claimBanner(`msg_${d.id}`, w.latestMs)) return;
          const mentioned = Array.isArray(data?.mentions) && data.mentions.includes(uid);
          const name = (data?.userName as string) || 'Clan member';
          const text = (data?.text as string) || '📷 Photo';
          void notifyDevice('chat', mentioned ? `${name} mentioned you` : name, text.slice(0, 140), {
            type: 'clan_message', clanId, link: `/clan/${clanId}/chat`, messageId: d.id,
          });
        },
        err => console.warn('Clan unread listener error:', err),
      );

      // Needs the clanId + mentions + createdAt index; without it only @ badges are missing.
      const stopMention = onSnapshot(
        query(collection(db, 'clan_messages'), ...scope, where('mentions', 'array-contains', uid), orderBy('createdAt', 'desc'), limit(1)),
        snap => {
          w.mentionMs = timestampMs(snap.docs[0]?.data({ serverTimestamps: 'estimate' })?.createdAt);
          recompute();
        },
        err => console.warn('Clan mention listener error:', err),
      );

      w.stop = () => { stopLatest(); stopMention(); };
      watches.set(clanId, w);
    };

    const stopMemberships = onSnapshot(
      query(collection(db, 'clan_memberships'), where('userId', '==', uid), where('status', '==', 'active')),
      snap => {
        const current = new Set<string>();
        snap.docs.forEach(d => {
          const m = d.data();
          const clanId = m.clanId as string;
          if (!clanId) return;
          current.add(clanId);
          // A join made just now has no server historyFrom yet; the next snapshot fills it in.
          if (watches.has(clanId) || d.metadata.hasPendingWrites) return;
          const historyFrom = m.historyFrom && typeof m.historyFrom.toMillis === 'function' ? m.historyFrom as Timestamp : null;
          watchClan(clanId, historyFrom, timestampMs(m.joinedAt));
        });
        watches.forEach((w, clanId) => {
          if (!current.has(clanId)) { w.stop(); watches.delete(clanId); }
        });
        recompute();
      },
      err => console.warn('Clan membership listener error:', err),
    );

    const stopReads = onSnapshot(
      query(collection(db, 'clan_reads'), where('userId', '==', uid)),
      snap => {
        snap.docs.forEach(d => {
          const data = d.data({ serverTimestamps: 'estimate' });
          if (typeof data.clanId === 'string') serverReads[data.clanId] = timestampMs(data.lastReadAt);
        });
        readsLoaded = true;
        recompute();
      },
      err => {
        console.warn('Clan read markers unavailable:', err);
        readsLoaded = true;
        recompute();
      },
    );

    // Local "read now" marks clear badges instantly.
    const stopLocal = store.subscribe((s, prev) => { if (s.localReads !== prev.localReads) recompute(); });

    return () => {
      stopMemberships();
      stopReads();
      stopLocal();
      watches.forEach(w => w.stop());
      watches.clear();
    };
  }, [uid]);

  return null;
}
