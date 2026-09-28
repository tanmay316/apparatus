import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Save, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';

type KeyName = 'groq_api_key' | 'nvidia_api_key' | 'gemini_api_key' | 'openrouter_api_key';

const KEY_FIELDS: { name: KeyName; label: string; placeholder: string }[] = [
  { name: 'groq_api_key', label: 'Groq (primary)', placeholder: 'gsk_...' },
  { name: 'nvidia_api_key', label: 'NVIDIA (fallback 1)', placeholder: 'nvapi-...' },
  { name: 'gemini_api_key', label: 'Gemini (fallback 2)', placeholder: 'AIza...' },
  { name: 'openrouter_api_key', label: 'OpenRouter (fallback 3)', placeholder: 'sk-or-v1-...' },
];

/** Personal AI provider keys, rendered inside a settings section. */
export default function PersonalAISettings() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<Record<KeyName, string>>({
    groq_api_key: '',
    nvidia_api_key: '',
    gemini_api_key: '',
    openrouter_api_key: '',
  });
  const [showKeys, setShowKeys] = useState<Partial<Record<KeyName, boolean>>>({});
  const [globalMode, setGlobalMode] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadKeys() {
      if (!user) return;
      try {
        const globalDoc = await getDoc(doc(db, 'admin_settings', 'ai_mode'));
        if (globalDoc.exists() && globalDoc.data().use_admin_keys) setGlobalMode(true);
        const docSnap = await getDoc(doc(db, 'users', user.uid, 'private', 'api_keys'));
        if (docSnap.exists()) setKeys(prev => ({ ...prev, ...(docSnap.data() as any) }));
      } catch (err) {
        console.error('Error loading personal AI settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadKeys();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'users', user.uid, 'private', 'api_keys'), keys);
      setMessage('Saved');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('Could not save keys');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6 text-[13px] dx-muted">Loading…</div>;

  if (globalMode) {
    return (
      <div className="py-4 flex items-start gap-3">
        <span className="dx-badge-icon !w-9 !h-9 !rounded-xl" style={{ background: 'var(--dx-success-soft)', color: 'var(--dx-success)' }}>
          <ShieldCheck size={17} />
        </span>
        <div>
          <div className="text-[14px] font-medium" style={{ color: 'var(--dx-text)' }}>Provided by Apparatus</div>
          <div className="text-[12.5px] dx-muted mt-0.5">AI features are enabled for everyone. No personal keys needed.</div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="py-4 space-y-4">
      <p className="text-[12.5px] dx-muted">Keys are stored in your private profile and tried in this order.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {KEY_FIELDS.map(field => (
          <div key={field.name}>
            <label className="dx-label" htmlFor={field.name}>{field.label}</label>
            <div className="relative">
              <input
                id={field.name}
                type={showKeys[field.name] ? 'text' : 'password'}
                className="dx-input font-mono !text-[13px] pr-10"
                value={keys[field.name]}
                onChange={e => setKeys({ ...keys, [field.name]: e.target.value })}
                placeholder={field.placeholder}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKeys(prev => ({ ...prev, [field.name]: !prev[field.name] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 dx-muted hover:opacity-80"
                aria-label={showKeys[field.name] ? 'Hide key' : 'Show key'}
              >
                {showKeys[field.name] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3">
        {message && <span className="text-[12px] dx-muted">{message}</span>}
        <button type="submit" disabled={saving} className="dx-btn !h-10 !text-[13px]">
          <Save size={14} /> {saving ? 'Saving…' : 'Save keys'}
        </button>
      </div>
    </form>
  );
}
