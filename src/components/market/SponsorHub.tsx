import { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { BadgeCheck, CreditCard, Gift, ImagePlus, Megaphone, Sparkles, Target, Users, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { compressImageFile } from '@/utils/image-compression';
import {
  cancelSponsorship, createSponsorship, formatInr, listMySponsorships, openPaymentPage, type Sponsorship,
} from '@/services/market';
import { MarketSheet } from './MarketSheet';

const STATUS: Record<Sponsorship['status'], { label: string; cls: string }> = {
  pending: { label: 'Preparing quote', cls: 'dx-pill--neutral' },
  quoted: { label: 'Quote ready', cls: 'dx-pill--accent' },
  paid: { label: 'Paid · setting up', cls: 'dx-pill--success' },
  live: { label: 'Live', cls: 'dx-pill--success' },
  declined: { label: 'Declined', cls: 'dx-pill--neutral' },
  cancelled: { label: 'Cancelled', cls: 'dx-pill--neutral' },
};

type Target = { type: 'challenge' | 'event'; id: string; title: string };

async function myCompetitions(uid: string): Promise<Target[]> {
  const [ch, ev] = await Promise.all([
    getDocs(query(collection(db, 'challenges_v2'), where('createdBy', '==', uid), limit(30))),
    getDocs(query(collection(db, 'simple_events'), where('createdBy', '==', uid), limit(30))),
  ]);
  return [
    ...ch.docs.filter(d => d.data().status !== 'completed').map(d => ({ type: 'challenge' as const, id: d.id, title: String(d.data().title || 'Challenge') })),
    ...ev.docs.filter(d => d.data().status !== 'completed').map(d => ({ type: 'event' as const, id: d.id, title: String(d.data().title || 'Event') })),
  ];
}

function SponsorRequestSheet({ onClose }: { onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const targets = useQuery({ queryKey: ['myCompetitions', user?.uid], queryFn: () => myCompetitions(user!.uid), enabled: !!user });

  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [prize, setPrize] = useState('');
  const [target, setTarget] = useState<string>('host');
  const [budget, setBudget] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [message, setMessage] = useState('');
  const [compressing, setCompressing] = useState(false);

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCompressing(true);
    try {
      const url = await compressImageFile(file, 256, 256, 0.8);
      if (url.length > 150_000) throw new Error('Logo is too large. Try a simpler image.');
      setLogoUrl(url);
    } catch (err: any) {
      showToast(err?.message || 'Could not read that image', 'error');
    } finally {
      setCompressing(false);
    }
  };

  const site = website.trim() && !/^https:\/\//.test(website.trim()) ? `https://${website.trim().replace(/^http:\/\//, '')}` : website.trim();
  const valid = brandName.trim().length >= 2 && prize.trim().length >= 2 && /^[^@ ]+@[^@ ]+\.[^@ ]+$/.test(contactEmail.trim());

  const submit = useMutation({
    mutationFn: async () => {
      const t = (targets.data || []).find(x => `${x.type}:${x.id}` === target);
      await createSponsorship({
        requesterId: user!.uid,
        requesterName: (profile?.displayName || '').slice(0, 60),
        brandName: brandName.trim().slice(0, 80),
        logoUrl,
        website: site.slice(0, 200),
        prize: prize.trim().slice(0, 300),
        message: message.trim().slice(0, 1000),
        contactEmail: contactEmail.trim().slice(0, 120),
        contactPhone: contactPhone.trim().slice(0, 20),
        targetType: t ? t.type : 'host',
        targetId: t?.id,
        targetTitle: t?.title.slice(0, 120),
        budgetInr: budget ? Math.min(10_000_000, parseInt(budget, 10) || 0) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mySponsorships'] });
      showToast('Thanks! We\'ll email you a quote.', 'success');
      onClose();
    },
    onError: (e: any) => showToast(e?.message || 'Could not send the request', 'error'),
  });

  return (
    <MarketSheet
      title="Promote your brand"
      subtitle="Tell us about your brand and the prize you'll give winners. We'll reply with a price; your logo goes live after payment."
      onClose={onClose}
      footer={<button type="button" className="dx-btn w-full" disabled={!valid || submit.isPending || compressing} onClick={() => submit.mutate()}>{submit.isPending ? 'Sending…' : 'Get a quote'}</button>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => fileRef.current?.click()} className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center overflow-hidden shrink-0 border" style={{ borderColor: 'var(--dx-border)' }} aria-label="Upload logo">
            {logoUrl ? <img src={logoUrl} alt="Logo preview" className="w-full h-full object-contain" /> : <ImagePlus size={20} color="#6b7280" />}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onLogo} />
          <div className="flex-1 min-w-0">
            <label className="dx-label" htmlFor="sr-brand">Brand / gym / clan name</label>
            <input id="sr-brand" className="dx-input w-full" maxLength={80} value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="e.g. Iron Temple Gym" />
          </div>
          {logoUrl && <button type="button" className="dx-icon-btn dx-icon-btn--sm" aria-label="Remove logo" onClick={() => setLogoUrl('')}><X size={14} /></button>}
        </div>
        <div>
          <label className="dx-label" htmlFor="sr-prize">Prize you'll provide</label>
          <input id="sr-prize" className="dx-input w-full" maxLength={300} value={prize} onChange={e => setPrize(e.target.value)} placeholder="e.g. 3 months free membership for the top 3" />
        </div>
        <div>
          <label className="dx-label" htmlFor="sr-target">Where should it appear?</label>
          <select id="sr-target" className="dx-input w-full" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="host">Apparatus runs a new public challenge for us</option>
            {(targets.data || []).map(t => <option key={`${t.type}:${t.id}`} value={`${t.type}:${t.id}`}>{t.type === 'challenge' ? 'Challenge' : 'Event'}: {t.title}</option>)}
          </select>
          <p className="text-[12px] dx-muted mt-1">Pick one of your own challenges or events, or let us run one for your brand.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="dx-label" htmlFor="sr-web">Website (optional)</label>
            <input id="sr-web" className="dx-input w-full" maxLength={200} value={website} onChange={e => setWebsite(e.target.value)} placeholder="irontemple.in" />
          </div>
          <div>
            <label className="dx-label" htmlFor="sr-budget">Budget in ₹ (optional)</label>
            <input id="sr-budget" className="dx-input w-full" inputMode="numeric" value={budget} onChange={e => setBudget(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} placeholder="5000" />
          </div>
          <div>
            <label className="dx-label" htmlFor="sr-email">Contact email</label>
            <input id="sr-email" type="email" className="dx-input w-full" maxLength={120} value={contactEmail} placeholder="Where we send the quote" autoComplete="off" onChange={e => setContactEmail(e.target.value)} />
          </div>
          <div>
            <label className="dx-label" htmlFor="sr-phone">Phone (optional)</label>
            <input id="sr-phone" type="tel" className="dx-input w-full" maxLength={20} value={contactPhone} onChange={e => setContactPhone(e.target.value.replace(/[^0-9+ ]/g, ''))} />
          </div>
        </div>
        <div>
          <label className="dx-label" htmlFor="sr-msg">Anything else? (optional)</label>
          <textarea id="sr-msg" className="dx-input w-full" rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Dates, audience, city…" />
        </div>
      </div>
    </MarketSheet>
  );
}

export function SponsorHub() {
  const { user } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const mine = useQuery({ queryKey: ['mySponsorships', user?.uid], queryFn: () => listMySponsorships(user!.uid), enabled: !!user });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelSponsorship(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mySponsorships'] }),
    onError: (e: any) => showToast(e?.message || 'Could not cancel', 'error'),
  });

  return (
    <div className="space-y-4">
      <section className="dx-hero p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="dx-hero-icon"><Megaphone size={20} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] opacity-75">For brands, gyms & stores</div>
            <h2 className="mt-1 text-[21px] font-semibold leading-tight">Advertise to athletes</h2>
            <p className="mt-1.5 text-[13px] opacity-80 leading-relaxed">Feature your brand on a challenge: your logo and a prize you give away appear on the challenge, in the feed and on the leaderboard. Nothing is charged until you accept our quote.</p>
          </div>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="dx-hero-btn w-full mt-4"><Sparkles size={16} /> Get a quote</button>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[
          { icon: Target, t: '1. Tell us about you', b: 'Brand, logo, the prize for winners and your budget.' },
          { icon: Gift, t: '2. Get a quote', b: 'We reply with a price. Pay only if you accept.' },
          { icon: Users, t: '3. Go live', b: 'Your logo and prize show to everyone who joins.' },
        ].map(s => (
          <div key={s.t} className="dx-card p-3.5 flex items-start gap-3">
            <span className="dx-badge-icon" style={{ background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }}><s.icon size={16} /></span>
            <div><div className="text-[14px] font-semibold">{s.t}</div><div className="text-[12px] dx-muted">{s.b}</div></div>
          </div>
        ))}
      </section>

      {!!(mine.data || []).length && (
        <section className="dx-card p-4">
          <div className="text-[15px] font-semibold mb-2">Your campaigns</div>
          <div className="dx-list">
            {mine.data!.map(s => (
              <div key={s.id} className="py-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-white overflow-hidden flex items-center justify-center shrink-0">
                  {s.logoUrl ? <img src={s.logoUrl} alt="" className="w-full h-full object-contain" /> : <Gift size={16} color="#6b7280" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate">{s.brandName}</div>
                  <div className="text-[12px] dx-muted truncate">{s.targetType === 'host' ? 'Hosted by Apparatus' : s.targetTitle || s.targetType}{s.amountInr ? ` · ${formatInr(s.amountInr)}` : ''}</div>
                </div>
                <span className={`dx-pill ${STATUS[s.status]?.cls || 'dx-pill--neutral'}`}>
                  {s.status === 'live' && <BadgeCheck size={12} />}{STATUS[s.status]?.label || s.status}
                </span>
                {s.status === 'quoted' && s.payUrl && (
                  <button type="button" className="dx-btn !h-9 !px-3 gap-1.5 text-[13px]" onClick={() => openPaymentPage(s.payUrl).catch(err => showToast(err.message, 'error'))}>
                    <CreditCard size={14} /> Pay quote
                  </button>
                )}
                {(s.status === 'pending' || s.status === 'quoted') && (
                  <button
                    type="button"
                    className="dx-icon-btn dx-icon-btn--sm"
                    aria-label="Cancel campaign"
                    onClick={async () => { if (await confirm({ title: 'Cancel this campaign?', message: 'You can always start a new one.', confirmText: 'Cancel campaign', type: 'danger' })) cancel.mutate(s.id); }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <AnimatePresence>{open && <SponsorRequestSheet key="sponsor" onClose={() => setOpen(false)} />}</AnimatePresence>
    </div>
  );
}
