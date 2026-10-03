import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import {
  CalendarDays, Dumbbell, ExternalLink, Eye, EyeOff, ImagePlus, Megaphone, Package, Pencil, Plus, Shield, ShoppingBag,
  Sparkles, Trash2, Trophy, X, type LucideIcon,
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { compressImageFile } from '@/utils/image-compression';
import { getUserPlans } from '@/services/plans';
import {
  SHOWCASE_KINDS, createShowcaseItem, deleteShowcaseItem, getMyMarketRequest, listMyShowcase, recordShowcaseClick,
  sendMarketRequest, updateShowcaseItem,
  type RequestKind, type ShowcaseInput, type ShowcaseItem, type ShowcaseKind, type ShowcaseTarget,
} from '@/services/showcase';
import { MarketSheet } from './MarketSheet';
import { EventDetailSheet } from '@/components/community/EventDetailSheet';
import { ChallengeDetailSheet } from '@/components/community/ChallengeDetailSheet';
import { BRAND } from '@/lib/brand';

export const KIND_ICON: Record<ShowcaseKind, LucideIcon> = {
  product: Package, gear: ShoppingBag, plan: CalendarDays, event: CalendarDays, challenge: Trophy, clan: Shield,
  service: Dumbbell, offer: Megaphone,
};
const kindLabel = (k: ShowcaseKind) => SHOWCASE_KINDS.find(x => x.id === k)?.label || 'Listing';

export function isSafeHttps(url: string | undefined): url is string {
  try { return new URL(url || '').protocol === 'https:'; } catch { return false; }
}

async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) {
    try { await Browser.open({ url }); return; } catch { /* fall back */ }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export { useMarketPartner } from './use-market-partner';

export function ShowcaseCard({ item, onOpen }: { item: ShowcaseItem; onOpen: () => void }) {
  const Icon = KIND_ICON[item.kind] || Package;
  return (
    <button type="button" onClick={onOpen} className="dx-card overflow-hidden text-left flex flex-col min-w-0">
      <div className="aspect-[16/10] w-full flex items-center justify-center overflow-hidden" style={{ background: 'var(--dx-inset, rgba(127,127,127,0.08))' }}>
        {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Icon size={28} className="dx-muted" />}
      </div>
      <div className="p-3 flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="text-[11px] dx-muted truncate">{kindLabel(item.kind)}{item.ownerName ? ` · ${item.ownerName}` : ''}</div>
        <div className="text-[14px] font-semibold leading-snug line-clamp-2">{item.title}</div>
        {item.priceText && <div className="mt-auto pt-1 text-[13px] font-semibold">{item.priceText}</div>}
      </div>
    </button>
  );
}

const ACTION: Record<ShowcaseTarget, string> = {
  url: 'Visit website', event: 'View event', challenge: 'View challenge', clan: 'View clan', plan: 'View plan',
};

export function ShowcaseSheet({ item, onClose }: { item: ShowcaseItem; onClose: () => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<'event' | 'challenge' | null>(null);
  const Icon = KIND_ICON[item.kind] || Package;
  const external = item.targetType === 'url';
  const disabled = external ? !isSafeHttps(item.url) : !item.targetId;

  const go = () => {
    recordShowcaseClick(item.id);
    if (item.targetType === 'url' && isSafeHttps(item.url)) { void openExternal(item.url); return; }
    if (item.targetType === 'event' || item.targetType === 'challenge') { setOpen(item.targetType); return; }
    onClose();
    navigate(item.targetType === 'clan' ? `/clan/${item.targetId}` : `/plans/${item.targetId}`);
  };

  return (
    <>
      <MarketSheet
        title={item.title}
        subtitle={`${kindLabel(item.kind)}${item.ownerName ? ` by ${item.ownerName}` : ''}`}
        onClose={onClose}
        footer={(
          <button type="button" className="dx-btn w-full" disabled={disabled} onClick={go}>
            {external && <ExternalLink size={15} />} {ACTION[item.targetType]}
          </button>
        )}
      >
        <div className="space-y-3">
          <div className="rounded-2xl overflow-hidden aspect-[16/9] flex items-center justify-center" style={{ background: 'var(--dx-inset, rgba(127,127,127,0.08))' }}>
            {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" /> : <Icon size={36} className="dx-muted" />}
          </div>
          {item.priceText && <div className="text-[18px] font-semibold">{item.priceText}</div>}
          {item.description && <p className="text-[13.5px] leading-relaxed whitespace-pre-line">{item.description}</p>}
          {external && isSafeHttps(item.url) && (
            <p className="text-[12px] dx-muted break-all">Opens {new URL(item.url).hostname}. Purchases happen on the seller's own site.</p>
          )}
        </div>
      </MarketSheet>
      <AnimatePresence>
        {open === 'event' && item.targetId && <EventDetailSheet key="ev" eventId={item.targetId} onClose={() => setOpen(null)} />}
        {open === 'challenge' && item.targetId && <ChallengeDetailSheet key="ch" challengeId={item.targetId} onClose={() => setOpen(null)} />}
      </AnimatePresence>
    </>
  );
}

type OwnTarget = { id: string; title: string };

async function ownTargets(uid: string, type: ShowcaseTarget): Promise<OwnTarget[]> {
  if (type === 'plan') return (await getUserPlans(uid)).filter(p => p.id && p.isPublic && !p.purchasedFrom).map(p => ({ id: p.id!, title: p.title || 'Plan' }));
  const [coll, field] = type === 'event' ? ['simple_events', 'createdBy'] : type === 'challenge' ? ['challenges_v2', 'createdBy'] : ['clans_v2', 'leaderId'];
  const snap = await getDocs(query(collection(db, coll), where(field, '==', uid), limit(40)));
  return snap.docs
    .filter(d => d.data().status !== 'completed' && d.data().status !== 'cancelled')
    .map(d => ({ id: d.id, title: String(d.data().title || d.data().name || 'Untitled') }));
}

export function ShowcaseEditor({ item, onClose }: { item?: ShowcaseItem; onClose: () => void }) {
  const { user, profile } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ShowcaseKind>(item?.kind || 'product');
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [imageUrl, setImageUrl] = useState(item?.imageUrl || '');
  const [priceText, setPriceText] = useState(item?.priceText || '');
  const [url, setUrl] = useState(item?.url || '');
  const [targetId, setTargetId] = useState(item?.targetId || '');
  const [busyImg, setBusyImg] = useState(false);
  const target = SHOWCASE_KINDS.find(k => k.id === kind)!.target;
  const targets = useQuery({
    queryKey: ['ownTargets', user?.uid, target],
    queryFn: () => ownTargets(user!.uid, target),
    enabled: !!user && target !== 'url',
  });

  const fullUrl = url.trim() && !/^https:\/\//i.test(url.trim()) ? `https://${url.trim().replace(/^http:\/\//i, '')}` : url.trim();
  const valid = title.trim().length >= 3 && (target === 'url' ? isSafeHttps(fullUrl) : !!targetId);

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyImg(true);
    try {
      let out = await compressImageFile(file, 800, 500, 0.75);
      if (out.length > 150_000) out = await compressImageFile(file, 560, 350, 0.6);
      if (out.length > 150_000) throw new Error('That image is too detailed. Try another one.');
      setImageUrl(out);
    } catch (err: any) {
      showToast(err?.message || 'Could not read that image', 'error');
    } finally {
      setBusyImg(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const input: ShowcaseInput = {
        kind, title, description, imageUrl, priceText, targetType: target,
        targetId: target === 'url' ? '' : targetId, url: target === 'url' ? fullUrl : '', active: item ? item.active : true,
      };
      if (item) await updateShowcaseItem(item, input);
      else await createShowcaseItem({ uid: user!.uid, name: profile?.displayName || '', photo: profile?.photoURL || '' }, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myShowcase'] });
      queryClient.invalidateQueries({ queryKey: ['showcase'] });
      showToast(item ? 'Listing updated' : 'Listing published', 'success');
      onClose();
    },
    onError: (e: any) => showToast(e?.message || 'Could not save', 'error'),
  });

  return (
    <MarketSheet
      title={item ? 'Edit listing' : 'New listing'}
      onClose={onClose}
      footer={<button type="button" className="dx-btn w-full" disabled={!valid || save.isPending || busyImg} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : item ? 'Save' : 'Publish'}</button>}
    >
      <div className="space-y-4">
        <div>
          <label className="dx-label" htmlFor="sc-kind">What are you listing?</label>
          <select id="sc-kind" className="dx-input w-full" value={kind} onChange={e => { setKind(e.target.value as ShowcaseKind); setTargetId(''); }}>
            {SHOWCASE_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <span className="dx-label">Picture (optional)</span>
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full aspect-[16/9] rounded-2xl overflow-hidden flex items-center justify-center relative" style={{ background: 'var(--dx-inset, rgba(127,127,127,0.08))' }}>
            {imageUrl ? <img src={imageUrl} alt="" className="w-full h-full object-cover" /> : <span className="flex items-center gap-2 text-[13px] dx-muted"><ImagePlus size={18} /> {busyImg ? 'Processing…' : 'Add a picture'}</span>}
          </button>
          {imageUrl && <button type="button" className="dx-link text-[12.5px] mt-1.5 inline-flex items-center gap-1" onClick={() => setImageUrl('')}><X size={12} /> Remove picture</button>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onImage} />
        </div>
        <div>
          <label className="dx-label" htmlFor="sc-title">Title</label>
          <input id="sc-title" className="dx-input w-full" maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Adjustable dumbbells 24 kg" />
        </div>
        <div>
          <label className="dx-label" htmlFor="sc-desc">Description (optional)</label>
          <textarea id="sc-desc" className="dx-input w-full" rows={4} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="dx-label" htmlFor="sc-price">Price or offer (optional)</label>
          <input id="sc-price" className="dx-input w-full" maxLength={40} value={priceText} onChange={e => setPriceText(e.target.value)} placeholder="e.g. ₹2,499 · 20% off · Free trial" />
        </div>
        {target === 'url' ? (
          <div>
            <label className="dx-label" htmlFor="sc-url">Link</label>
            <input id="sc-url" className="dx-input w-full" inputMode="url" maxLength={300} value={url} onChange={e => setUrl(e.target.value)} placeholder="yourstore.com/product" />
            <p className="text-[12px] dx-muted mt-1">People tap through to this page. Use a secure (https) link.</p>
          </div>
        ) : (
          <div>
            <label className="dx-label" htmlFor="sc-target">Which one?</label>
            <select id="sc-target" className="dx-input w-full" value={targetId} onChange={e => setTargetId(e.target.value)}>
              <option value="">{targets.isLoading ? 'Loading…' : 'Choose…'}</option>
              {(targets.data || []).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            {!targets.isLoading && !(targets.data || []).length && (
              <p className="text-[12px] dx-muted mt-1">{target === 'plan' ? 'Make one of your plans public first.' : `Create a ${target} first, then list it here.`}</p>
            )}
          </div>
        )}
      </div>
    </MarketSheet>
  );
}

/** A partner's own listings with edit / hide / delete. */
export function MyListings() {
  const { user } = useAuthStore();
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ShowcaseItem | 'new' | null>(null);
  const mine = useQuery({ queryKey: ['myShowcase', user?.uid], queryFn: () => listMyShowcase(user!.uid), enabled: !!user });
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['myShowcase'] }); queryClient.invalidateQueries({ queryKey: ['showcase'] }); };

  const toggle = useMutation({
    mutationFn: (i: ShowcaseItem) => updateShowcaseItem(i, { ...i, active: !i.active }),
    onSuccess: refresh,
    onError: (e: any) => showToast(e?.message || 'Could not update', 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteShowcaseItem(id),
    onSuccess: () => { refresh(); showToast('Listing removed'); },
    onError: (e: any) => showToast(e?.message || 'Could not remove', 'error'),
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Your listings</div>
          <div className="text-[12.5px] dx-muted">Shown in the Marketplace. People tap through to your page, plan, event or clan.</div>
        </div>
        <button type="button" className="dx-btn !h-10 shrink-0" onClick={() => setEditing('new')}><Plus size={15} /> New</button>
      </div>
      {mine.isLoading ? <div className="dx-card h-20 animate-pulse" /> : !(mine.data || []).length ? (
        <div className="dx-card p-6 text-center">
          <Sparkles size={20} className="mx-auto dx-muted" />
          <div className="text-[14px] font-semibold mt-2">No listings yet</div>
          <p className="text-[12.5px] dx-muted mt-1">Add your first product, plan, event or community.</p>
        </div>
      ) : (
        <div className="dx-card dx-list overflow-hidden">
          {mine.data!.map(i => {
            const Icon = KIND_ICON[i.kind] || Package;
            return (
              <div key={i.id} className="p-3 flex items-center gap-3">
                <span className="w-12 h-12 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'var(--dx-inset, rgba(127,127,127,0.08))' }}>
                  {i.imageUrl ? <img src={i.imageUrl} alt="" className="w-full h-full object-cover" /> : <Icon size={18} className="dx-muted" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold truncate">{i.title}</div>
                  <div className="text-[12px] dx-muted truncate">{kindLabel(i.kind)} · {i.active ? 'Live' : 'Hidden'} · {i.clicks || 0} views</div>
                </div>
                <button type="button" className="dx-icon-btn dx-icon-btn--sm" aria-label="Edit listing" onClick={() => setEditing(i)}><Pencil size={14} /></button>
                <button type="button" className="dx-icon-btn dx-icon-btn--sm" aria-label={i.active ? 'Hide listing' : 'Show listing'} onClick={() => toggle.mutate(i)}>
                  {i.active ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button" className="dx-icon-btn dx-icon-btn--sm" aria-label="Delete listing"
                  onClick={async () => { if (await confirm({ title: 'Delete listing?', message: 'It disappears from the Marketplace.', confirmText: 'Delete', type: 'danger' })) remove.mutate(i.id); }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <AnimatePresence>
        {editing && <ShowcaseEditor key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      </AnimatePresence>
    </section>
  );
}

const REQUEST_KINDS: { id: RequestKind; label: string }[] = [
  { id: 'brand', label: 'Brand / store' },
  { id: 'gym', label: 'Gym / studio' },
  { id: 'coach', label: 'Coach / trainer' },
  { id: 'community', label: 'Club / clan / community' },
  { id: 'organizer', label: 'Event organiser' },
  { id: 'other', label: 'Something else' },
];

/** Ask the Apparatus team for permission to list on the Marketplace. */
export function RequestAccess() {
  const { user } = useAuthStore();
  const { showToast } = useUIStore();
  const queryClient = useQueryClient();
  const existing = useQuery({ queryKey: ['myMarketRequest', user?.uid], queryFn: () => getMyMarketRequest(user!.uid), enabled: !!user });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [kind, setKind] = useState<RequestKind>('brand');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [message, setMessage] = useState('');
  const emailVerified = !!auth.currentUser?.emailVerified;
  const req = existing.data;

  useEffect(() => {
    if (!req || !editing) return;
    setName(req.name || ''); setBusiness(req.business); setKind(req.kind); setContactEmail(req.contactEmail);
    setContactPhone(req.contactPhone || ''); setWebsite(req.website || ''); setMessage(req.message || '');
  }, [req, editing]);

  const site = website.trim() && !/^https:\/\//i.test(website.trim()) ? `https://${website.trim().replace(/^http:\/\//i, '')}` : website.trim();
  const valid = emailVerified && business.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(contactEmail.trim()) && (!site || isSafeHttps(site));

  const send = useMutation({
    mutationFn: () => sendMarketRequest(user!.uid, { name, business, kind, contactEmail, contactPhone, website: site, message }, req ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myMarketRequest'] });
      setEditing(false);
      showToast('Request sent. We\'ll get in touch soon.', 'success');
    },
    onError: (e: any) => showToast(e?.message || 'Could not send the request', 'error'),
  });

  if (existing.isLoading) return <div className="dx-card h-40 animate-pulse" />;

  if (req && !editing) {
    const declined = req.status === 'declined';
    return (
      <section className="dx-card p-4">
        <div className="text-[15px] font-semibold">{declined ? 'Request not approved' : 'Request received'}</div>
        <p className="text-[13px] dx-muted mt-1 leading-snug">
          {declined
            ? req.adminNote || 'We couldn\'t approve this request. You can update it and send it again.'
            : `Thanks, ${req.business}. Our team will contact you at ${req.contactEmail}${req.contactPhone ? ' or by phone' : ''}.`}
        </p>
        <button type="button" className="dx-btn-secondary !h-10 mt-3" onClick={() => setEditing(true)}>{declined ? 'Update and resend' : 'Edit request'}</button>
      </section>
    );
  }

  return (
    <section className="dx-card p-4 space-y-4">
      <div>
        <div className="text-[15px] font-semibold">List on the Marketplace</div>
        <p className="text-[13px] dx-muted mt-0.5 leading-snug">Brands, gyms, coaches and community owners can show their products, plans, events and clans to athletes. Tell us about you and we'll get in touch.</p>
      </div>
      {!emailVerified && <p className="dx-inset p-3 text-[13px]">Verify your account email first (check your inbox for the link we sent when you signed up).</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="dx-label" htmlFor="ra-business">Business or community name</label>
          <input id="ra-business" className="dx-input w-full" maxLength={80} value={business} onChange={e => setBusiness(e.target.value)} />
        </div>
        <div>
          <label className="dx-label" htmlFor="ra-kind">You are a</label>
          <select id="ra-kind" className="dx-input w-full" value={kind} onChange={e => setKind(e.target.value as RequestKind)}>
            {REQUEST_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className="dx-label" htmlFor="ra-name">Your name (optional)</label>
          <input id="ra-name" className="dx-input w-full" maxLength={60} autoComplete="off" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="dx-label" htmlFor="ra-web">Website (optional)</label>
          <input id="ra-web" className="dx-input w-full" inputMode="url" maxLength={200} value={website} onChange={e => setWebsite(e.target.value)} placeholder="yourbrand.com" />
        </div>
        <div>
          <label className="dx-label" htmlFor="ra-email">Contact email</label>
          <input id="ra-email" type="email" className="dx-input w-full" maxLength={120} autoComplete="off" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
        </div>
        <div>
          <label className="dx-label" htmlFor="ra-phone">Phone (optional)</label>
          <input id="ra-phone" type="tel" className="dx-input w-full" maxLength={20} autoComplete="off" value={contactPhone} onChange={e => setContactPhone(e.target.value.replace(/[^0-9+ ]/g, ''))} />
        </div>
      </div>
      <div>
        <label className="dx-label" htmlFor="ra-msg">What would you like to list? (optional)</label>
        <textarea id="ra-msg" className="dx-input w-full" rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Products, classes, events, a running club…" />
      </div>
      <div className="flex gap-2">
        {editing && <button type="button" className="dx-btn-secondary flex-1" onClick={() => setEditing(false)}>Cancel</button>}
        <button type="button" className="dx-btn flex-1" disabled={!valid || send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Sending…' : 'Send request'}</button>
      </div>
      <p className="text-[12px] dx-muted">Your contact details are only seen by the {BRAND.name} team.</p>
    </section>
  );
}
