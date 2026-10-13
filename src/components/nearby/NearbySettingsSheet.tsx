import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Geolocation } from '@capacitor/geolocation';
import { EyeOff, Globe, Home, Loader2, MapPin, Radar, ShieldCheck, Timer, Users, X, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useBodyScrollLock } from '@/lib/scroll-lock';
import {
  clearPresence, getPrivacyZone, nearbyVisibilityOf, setPrivacyZone, type NearbyVisibility, type PrivacyZone,
} from '@/services/nearby';
import type { PrivacySettings } from '@/types';

const OPTIONS: { value: NearbyVisibility; label: string; description: string; icon: LucideIcon }[] = [
  { value: 'off', label: 'Off', description: 'Hidden. You can still see others.', icon: EyeOff },
  { value: 'followers', label: 'Followers', description: 'Only people who follow you.', icon: Users },
  { value: 'everyone', label: 'Everyone', description: 'Anyone training nearby.', icon: Globe },
];

const PROMISES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Timer, title: 'Only while you train', body: 'You appear live during a run, walk, ride or workout, then as a finished session for a few hours.' },
  { icon: MapPin, title: 'Your live position, not your route', body: 'Others see where you are right now. Finished runs are pinned mid-route, never at your start or finish.' },
  { icon: ShieldCheck, title: 'Private sessions stay private', body: 'A session you save as private never shows up on Nearby.' },
];

const ZONE_SIZES = [500, 1000];

/** Opt-in and privacy controls for Nearby (used on the Nearby page and in Settings). */
export function NearbySettingsSheet({ onClose }: { onClose: () => void }) {
  useBodyScrollLock();
  const { profile, updateProfile } = useAuthStore();
  const { showToast } = useUIStore();
  const [value, setValue] = useState<NearbyVisibility>(nearbyVisibilityOf(profile));
  const [zone, setZone] = useState<PrivacyZone | null>(getPrivacyZone);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const setZoneHere = async (radiusM = zone?.radiusM ?? 500) => {
    setLocating(true);
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15_000 });
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusM };
      setPrivacyZone(next);
      setZone(next);
      showToast('Privacy zone set on this phone');
    } catch {
      showToast('Could not get your location', 'error');
    } finally {
      setLocating(false);
    }
  };

  const changeZoneSize = (radiusM: number) => {
    if (!zone) return;
    const next = { ...zone, radiusM };
    setPrivacyZone(next);
    setZone(next);
  };

  const removeZone = () => {
    setPrivacyZone(null);
    setZone(null);
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const base: PrivacySettings = profile.privacySettings || {
        profileVisibility: profile.isPublic === false ? 'private' : 'public',
        showEventsToFollowers: true,
        showClansToFollowers: true,
        showStatsToFollowers: true,
      };
      await updateProfile({ privacySettings: { ...base, nearbyVisibility: value } });
      if (value === 'off') await clearPresence(profile.uid);
      showToast(value === 'off' ? 'You are hidden from Nearby' : `Nearby on: visible to ${value === 'everyone' ? 'everyone' : 'your followers'} while you train`);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="dx pro-scope dx-overlay" style={{ zIndex: 10030 }}>
      <motion.div className="dx-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Nearby visibility"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 32, stiffness: 340 }}
        className="dx-sheet sm:max-w-lg"
      >
        <div className="dx-sheet-handle" aria-hidden />
        <div className="dx-sheet-header items-center">
          <span className="dx-badge-icon !w-10 !h-10 !rounded-xl"><Radar size={19} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-semibold leading-tight">Nearby visibility</h2>
            <p className="mt-0.5 text-[13px] dx-muted leading-snug">Let athletes around you see that you're training too.</p>
          </div>
          <button type="button" onClick={onClose} className="dx-icon-btn dx-icon-btn--sm" aria-label="Close"><X size={17} /></button>
        </div>

        <div className="dx-sheet-body space-y-5">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Who can see you">
            {OPTIONS.map(o => {
              const on = value === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setValue(o.value)}
                  className="text-left p-3 rounded-2xl transition-colors"
                  style={{ background: on ? 'var(--dx-accent-soft)' : 'var(--dx-card-2)', boxShadow: on ? 'inset 0 0 0 1.5px var(--dx-accent)' : undefined }}
                >
                  <o.icon size={17} style={{ color: on ? 'var(--dx-accent)' : 'var(--dx-muted)' }} />
                  <div className="mt-2 text-[13.5px] font-semibold" style={{ color: on ? 'var(--dx-accent)' : 'var(--dx-text)' }}>{o.label}</div>
                  <div className="text-[11.5px] dx-muted leading-snug mt-0.5">{o.description}</div>
                </button>
              );
            })}
          </div>

          <ul className="dx-inset p-3.5 space-y-3">
            {PROMISES.map(p => (
              <li key={p.title} className="flex gap-3">
                <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--dx-success-soft)', color: 'var(--dx-success)' }}>
                  <p.icon size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{p.title}</span>
                  <span className="block text-[12px] dx-muted leading-snug">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>

          <section>
            <div className="flex items-center gap-2 text-[14px] font-semibold"><Home size={15} /> Hide me near home</div>
            <p className="text-[12px] dx-muted mt-0.5 leading-snug">You never appear around a spot you choose. Saved only on this phone.</p>
            {zone ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="dx-pill dx-pill--success">Privacy zone on</span>
                {ZONE_SIZES.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => changeZoneSize(r)}
                    className="dx-chip !h-8"
                    style={zone.radiusM === r ? { background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' } : undefined}
                  >
                    {r < 1000 ? `${r} m` : `${r / 1000} km`}
                  </button>
                ))}
                <button type="button" onClick={() => setZoneHere(zone.radiusM)} disabled={locating} className="dx-link !text-[12.5px]">
                  {locating ? 'Locating…' : 'Move here'}
                </button>
                <button type="button" onClick={removeZone} className="dx-link !text-[12.5px]" style={{ color: '#dc2626' }}>Remove</button>
              </div>
            ) : (
              <button type="button" onClick={() => setZoneHere()} disabled={locating} className="dx-btn-secondary mt-2.5 !h-10 !text-[13px]">
                {locating ? <Loader2 size={15} className="animate-spin" /> : <MapPin size={15} />} Use my current location
              </button>
            )}
          </section>
        </div>

        <div className="dx-sheet-footer flex gap-2.5">
          <button type="button" onClick={onClose} className="dx-btn-secondary px-5">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="dx-btn flex-1">
            {saving ? <Loader2 size={17} className="animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
