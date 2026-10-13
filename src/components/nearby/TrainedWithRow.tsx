import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLiveDisplayName } from '@/hooks/useLiveDisplayName';
import type { TrainedWith } from '@/types';
import { NearbyAvatar } from './nearby-ui';
import { GroupActivitySheet } from './GroupActivitySheet';
import type { PeekTarget } from './SessionPeekSheet';

function FirstName({ partner }: { partner: TrainedWith }) {
  const { displayName } = useLiveDisplayName(partner.uid, partner.displayName, partner.photoURL);
  return <span className="font-semibold text-[#17191c]">{displayName || 'Athlete'}</span>;
}

/**
 * Strava-style "with A and 2 others" on a post: people who were recording close to this athlete
 * at the same time. Tapping opens the group with everyone's session, stats and map.
 */
export function TrainedWithRow({ partners, fallbackStartMs }: { partners: TrainedWith[]; fallbackStartMs?: number }) {
  const [open, setOpen] = useState(false);
  const valid = partners.filter(p => p && typeof p.uid === 'string' && p.uid);
  if (!valid.length) return null;
  const others = valid.length - 1;
  const members: PeekTarget[] = valid.map(p => ({ ...p, aroundMs: p.startedAt || fallbackStartMs }));

  return (
    <>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        className="mb-3 -mt-1 w-full flex items-center gap-2.5 min-w-0 text-left rounded-2xl px-2.5 py-2 bg-[#17191c]/[0.035] hover:bg-[#17191c]/[0.06] transition-colors"
        aria-label={`Trained with ${valid.length} athlete${valid.length > 1 ? 's' : ''}`}
      >
        <span className="flex -space-x-2 shrink-0">
          {valid.slice(0, 3).map(p => <NearbyAvatar key={p.uid} athlete={p} size={28} />)}
        </span>
        <span className="flex-1 min-w-0 text-[12.5px] text-[#777b86] leading-snug truncate">
          with <FirstName partner={valid[0]} />
          {others > 0 && <> and <span className="font-semibold text-[#17191c]">{others} other{others > 1 ? 's' : ''}</span></>}
        </span>
        <ChevronRight size={16} className="text-[#777b86] shrink-0" />
      </button>
      {/* The sheet is portaled, but React events still bubble to the post card behind it. */}
      <div className="contents" onClick={e => e.stopPropagation()}>
        {open && <GroupActivitySheet members={members} onClose={() => setOpen(false)} />}
      </div>
    </>
  );
}
