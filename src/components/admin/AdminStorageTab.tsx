import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, HardDrive } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { calculateStorageUsage, cleanupDatabaseStorage, type StorageCleanupOptions, type StorageUsageResult } from '@/services/admin';
import { SectionHeader } from './AdminShared';

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);

const TYPE_OPTIONS: { key: keyof StorageCleanupOptions['types']; label: string; hint: string }[] = [
  { key: 'images', label: 'Inline images', hint: 'Base64 data: images in clan posts and chat. Hosted URLs are kept.' },
  { key: 'gps', label: 'GPS routes', hint: 'Route points on cardio sessions and feed posts. Maps disappear; stats stay.' },
  { key: 'text', label: 'Text content', hint: 'Post/message text and workout notes are replaced with a placeholder.' },
];

const COLLECTION_OPTIONS: { key: keyof StorageCleanupOptions['collections']; label: string }[] = [
  { key: 'feed', label: 'Feed activities' },
  { key: 'clan_posts', label: 'Clan posts' },
  { key: 'clan_messages', label: 'Clan chat messages' },
  { key: 'workouts', label: 'Workouts & cardio sessions' },
];

function Check({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer">
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 rounded border-line/30 bg-ink-2 text-sienna focus:ring-sienna/50" />
      <span>
        <span className="text-sm text-bone block">{label}</span>
        {hint && <span className="text-[11px] text-bone-dim">{hint}</span>}
      </span>
    </label>
  );
}

export function AdminStorageTab() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [opts, setOpts] = useState<StorageCleanupOptions>({
    types: { images: true, gps: false, text: false },
    collections: { feed: true, clan_posts: true, clan_messages: true, workouts: true },
    olderThanDays: 90,
  });
  // The estimate is tied to the options it was computed with, so cleanup can never run on different settings.
  const [estimate, setEstimate] = useState<{ result: StorageUsageResult; opts: StorageCleanupOptions } | null>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'cleaning'>('idle');

  const update = (fn: (o: StorageCleanupOptions) => StorageCleanupOptions) => { setOpts(fn); setEstimate(null); };
  const nothingSelected = !Object.values(opts.types).some(Boolean) || !Object.values(opts.collections).some(Boolean);

  const scan = async () => {
    setPhase('scanning');
    try {
      const snapshot = { ...opts, types: { ...opts.types }, collections: { ...opts.collections } };
      const result = await calculateStorageUsage(snapshot);
      setEstimate({ result, opts: snapshot });
      if (result.errors.length) showToast(`Scan finished with ${result.errors.length} error(s)`, 'error');
    } catch (e: any) {
      showToast(e?.message || 'Scan failed', 'error');
    } finally {
      setPhase('idle');
    }
  };

  const clean = async () => {
    if (!estimate) return;
    const { result, opts: used } = estimate;
    const ok = await confirm({
      title: 'Permanently remove data?',
      message: `About ${mb(result.totalBytes)} MB will be removed from ${result.affectedDocs.toLocaleString()} documents. This cannot be undone.`,
      confirmText: 'Remove data',
    });
    if (!ok) return;
    setPhase('cleaning');
    try {
      const { processed, errors } = await cleanupDatabaseStorage(used);
      showToast(errors.length ? `Cleaned ${processed} docs; ${errors.length} collection(s) failed` : `Cleanup complete: ${processed} documents updated`, errors.length ? 'error' : 'success');
      setEstimate(null);
      queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
    } catch (e: any) {
      showToast(e?.message || 'Cleanup failed', 'error');
    } finally {
      setPhase('idle');
    }
  };

  const result = estimate?.result;

  return (
    <section className="card p-5 space-y-5">
      <SectionHeader
        icon={HardDrive}
        title="Storage cleanup"
        description="Strip heavy fields from old records to reduce Firestore storage. Scan first; cleanup applies exactly the scanned settings."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-5 bg-ink-3 p-4 rounded-xl border border-line/30">
          <div className="space-y-3">
            <h3 className="font-mono text-[11px] text-sienna uppercase tracking-widest">Data to remove</h3>
            {TYPE_OPTIONS.map(t => (
              <Check key={t.key} id={`storage-type-${t.key}`} label={t.label} hint={t.hint} checked={opts.types[t.key]}
                onChange={v => update(o => ({ ...o, types: { ...o.types, [t.key]: v } }))} />
            ))}
          </div>
          <div className="space-y-3 pt-3 border-t border-line/20">
            <h3 className="font-mono text-[11px] text-sienna uppercase tracking-widest">Collections</h3>
            {COLLECTION_OPTIONS.map(c => (
              <Check key={c.key} id={`storage-coll-${c.key}`} label={c.label} checked={opts.collections[c.key]}
                onChange={v => update(o => ({ ...o, collections: { ...o.collections, [c.key]: v } }))} />
            ))}
          </div>
          <div className="pt-3 border-t border-line/20">
            <label htmlFor="storage-older-than" className="label">Only records older than</label>
            <select id="storage-older-than" value={opts.olderThanDays} onChange={e => update(o => ({ ...o, olderThanDays: Number(e.target.value) }))} className="input-field max-w-[220px]">
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>1 year</option>
              <option value={0}>All time (careful!)</option>
            </select>
          </div>
        </div>

        <div className="bg-ink-2 p-4 rounded-xl border border-line/40 flex flex-col">
          <h3 className="font-display text-lg mb-3">Estimate</h3>
          {result ? (
            <div className="flex-1 space-y-3">
              <div className="text-4xl font-display text-sienna">{mb(result.totalBytes)} <span className="text-xl">MB</span></div>
              <div className="text-xs font-mono text-bone-dim space-y-1 bg-ink-3 p-3 rounded-lg">
                <div>Images: {mb(result.imageBytes)} MB</div>
                <div>GPS: {mb(result.gpsBytes)} MB</div>
                <div>Text: {mb(result.textBytes)} MB</div>
                <div className="pt-1 mt-1 border-t border-line/20 text-bone">
                  {result.affectedDocs.toLocaleString()} of {result.scannedDocs.toLocaleString()} scanned docs would change
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-[11px] text-danger bg-danger/5 border border-danger/30 rounded-lg p-2 space-y-1">
                  <div className="flex items-center gap-1 font-semibold"><AlertTriangle size={12} /> Some collections could not be scanned</div>
                  {result.errors.map(err => <div key={err} className="break-words">{err}</div>)}
                </div>
              )}
            </div>
          ) : (
            <p className="flex-1 text-sm text-bone-dim">Run a scan to see how much space these settings would free.</p>
          )}
          <div className="space-y-2 mt-4">
            <button disabled={phase !== 'idle' || nothingSelected} onClick={scan} className="btn-secondary w-full py-2.5">
              {phase === 'scanning' ? 'Scanning…' : nothingSelected ? 'Select data and collections' : 'Scan'}
            </button>
            <button disabled={phase !== 'idle' || !result || result.affectedDocs === 0} onClick={clean} className="btn-danger w-full py-2.5">
              {phase === 'cleaning' ? 'Cleaning…' : 'Run cleanup'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
