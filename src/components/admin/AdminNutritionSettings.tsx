import { useEffect, useState } from 'react';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { Eye, EyeOff, Key, Save, Shield, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useUIStore } from '@/stores/ui-store';
import { logAdminAction } from '@/services/admin';
import { Switch } from '@/components/ui/Toggle';
import { LoadingState } from './AdminShared';

const PROVIDERS = [
  { field: 'groq_api_key', label: 'Groq', role: 'Primary', placeholder: 'gsk_…' },
  { field: 'nvidia_api_key', label: 'NVIDIA', role: 'Fallback 1', placeholder: 'nvapi-…' },
  { field: 'gemini_api_key', label: 'Gemini', role: 'Fallback 2', placeholder: 'AIza…' },
  { field: 'openrouter_api_key', label: 'OpenRouter', role: 'Fallback 3', placeholder: 'sk-or-v1-…' },
] as const;

type KeyField = typeof PROVIDERS[number]['field'];
type Keys = Record<KeyField, string>;

const EMPTY_KEYS: Keys = { groq_api_key: '', nvidia_api_key: '', gemini_api_key: '', openrouter_api_key: '' };
const mask = (v: string) => (v.length > 8 ? `••••${v.slice(-4)}` : v ? '••••' : 'not set');

export default function AdminNutritionSettings() {
  const showToast = useUIStore(s => s.showToast);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useAdminKeys, setUseAdminKeys] = useState(false);
  const [keys, setKeys] = useState<Keys>(EMPTY_KEYS);
  const [saved, setSaved] = useState<{ useAdminKeys: boolean; keys: Keys }>({ useAdminKeys: false, keys: EMPTY_KEYS });
  const [visible, setVisible] = useState<Partial<Record<KeyField, boolean>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [keysSnap, modeSnap] = await Promise.all([
          getDoc(doc(db, 'admin_settings', 'api_keys')),
          getDoc(doc(db, 'admin_settings', 'ai_mode')),
        ]);
        if (cancelled) return;
        const data = keysSnap.data() || {};
        const loaded = { ...EMPTY_KEYS };
        PROVIDERS.forEach(p => { if (typeof data[p.field] === 'string') loaded[p.field] = data[p.field]; });
        // ai_mode is the flag the backend reads; fall back to the legacy copy in api_keys.
        const mode = modeSnap.exists() ? !!modeSnap.data().use_admin_keys : !!data.use_admin_keys;
        setKeys(loaded);
        setUseAdminKeys(mode);
        setSaved({ useAdminKeys: mode, keys: loaded });
      } catch (err: any) {
        if (!cancelled) showToast(err?.message || 'Could not load AI settings', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showToast]);

  const trimmed = Object.fromEntries(PROVIDERS.map(p => [p.field, keys[p.field].trim()])) as Keys;
  const dirty = useAdminKeys !== saved.useAdminKeys || PROVIDERS.some(p => trimmed[p.field] !== saved.keys[p.field]);
  const anyKey = PROVIDERS.some(p => trimmed[p.field]);

  const handleSave = async () => {
    if (useAdminKeys && !anyKey) {
      showToast('Add at least one key before enabling global keys', 'error');
      return;
    }
    setSaving(true);
    try {
      // One batch so the backend never sees the flag on without the matching keys.
      const batch = writeBatch(db);
      batch.set(doc(db, 'admin_settings', 'api_keys'), { ...trimmed, use_admin_keys: useAdminKeys });
      batch.set(doc(db, 'admin_settings', 'ai_mode'), { use_admin_keys: useAdminKeys });
      await batch.commit();
      const changed = PROVIDERS.filter(p => trimmed[p.field] !== saved.keys[p.field]).map(p => p.label);
      await logAdminAction('settings.ai_keys', 'settings', 'api_keys', {
        details: `global keys ${useAdminKeys ? 'on' : 'off'}${changed.length ? ` · changed: ${changed.join(', ')}` : ''}`,
      });
      setKeys(trimmed);
      setSaved({ useAdminKeys, keys: trimmed });
      showToast('AI settings saved');
    } catch (err: any) {
      showToast(err?.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading AI settings…" />;

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sienna/20 flex items-center justify-center"><Shield className="text-sienna" size={20} /></div>
        <div>
          <h2 className="text-lg font-display text-bone font-semibold">Global AI keys</h2>
          <p className="text-xs text-bone-dim">Used by the nutrition and workout AI agents. Providers are tried in order: Groq → NVIDIA → Gemini → OpenRouter.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-ink-2 border border-line/40">
        <div>
          <div className="text-sm font-medium text-bone">Use global admin keys</div>
          <div className="text-xs text-bone-dim mt-0.5">When on, every user's AI requests are billed to these keys instead of their personal ones.</div>
        </div>
        <Switch checked={useAdminKeys} onChange={setUseAdminKeys} label="Use global admin keys" />
      </div>

      <div className="space-y-4">
        {PROVIDERS.map(p => (
          <div key={p.field}>
            <label htmlFor={`ai-${p.field}`} className="label flex items-center justify-between">
              <span>{p.label} <span className="normal-case font-normal">({p.role})</span></span>
              <span className={`normal-case font-normal ${saved.keys[p.field] ? 'text-sienna' : 'text-bone-dim'}`}>{mask(saved.keys[p.field])}</span>
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" size={15} />
              <input
                id={`ai-${p.field}`}
                type={visible[p.field] ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                value={keys[p.field]}
                onChange={e => setKeys(k => ({ ...k, [p.field]: e.target.value }))}
                className="input-field pl-10 pr-20 font-mono"
                placeholder={p.placeholder}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {keys[p.field] && (
                  <button type="button" onClick={() => setKeys(k => ({ ...k, [p.field]: '' }))} className="text-bone-dim hover:text-danger" title="Clear"><X size={15} /></button>
                )}
                <button type="button" onClick={() => setVisible(v => ({ ...v, [p.field]: !v[p.field] }))} className="text-bone-dim hover:text-bone" title={visible[p.field] ? 'Hide' : 'Show'}>
                  {visible[p.field] ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-bone-dim">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <button onClick={handleSave} disabled={saving || !dirty} className="btn-primary">
          <Save size={15} /> {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}
