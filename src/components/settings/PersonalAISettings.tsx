import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Key, Save, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';

export default function PersonalAISettings() {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState({
    nvidia_api_key: '',
    gemini_api_key: '',
    openrouter_api_key: ''
  });
  const [globalMode, setGlobalMode] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadKeys() {
      if (!user) return;
      try {
        // Check if global mode is on
        const globalDoc = await getDoc(doc(db, 'admin_settings', 'api_keys'));
        if (globalDoc.exists() && globalDoc.data().use_admin_keys) {
          setGlobalMode(true);
        }

        // Load personal keys
        const docRef = doc(db, 'users', user.uid, 'private', 'api_keys');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setKeys(docSnap.data() as any);
        }
      } catch (err) {
        console.error("Error loading personal AI settings:", err);
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
      setMessage('API keys saved securely.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('Failed to save API keys.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
        <Key size={18} className="text-amber" />
        <h3 className="font-display text-base uppercase tracking-wide text-bone">AI Nutrition API Keys</h3>
      </div>

      {globalMode ? (
        <div className="bg-sienna/10 border border-sienna/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="text-sienna mt-0.5" size={18} />
          <div>
            <div className="text-sm font-semibold text-sienna-light">Global Keys Active</div>
            <div className="text-xs text-bone-dim mt-1">
              The administrator has enabled global AI API keys. You do not need to provide your own API keys at this time.
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <p className="text-xs text-bone-dim">
            To use the AI Nutrition features, you must provide your own API keys. These are stored securely in your private profile.
          </p>

          <div>
            <label className="label">Nvidia API Key (Primary)</label>
            <input
              type="password"
              className="input-field font-mono text-sm"
              value={keys.nvidia_api_key}
              onChange={e => setKeys({ ...keys, nvidia_api_key: e.target.value })}
              placeholder="nvapi-..."
            />
          </div>

          <div>
            <label className="label">Gemini API Key (Fallback)</label>
            <input
              type="password"
              className="input-field font-mono text-sm"
              value={keys.gemini_api_key}
              onChange={e => setKeys({ ...keys, gemini_api_key: e.target.value })}
              placeholder="AIza..."
            />
          </div>

          <div>
            <label className="label">OpenRouter API Key (Fallback)</label>
            <input
              type="password"
              className="input-field font-mono text-sm"
              value={keys.openrouter_api_key}
              onChange={e => setKeys({ ...keys, openrouter_api_key: e.target.value })}
              placeholder="sk-or-v1-..."
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-teal">{message}</span>
            <button type="submit" disabled={saving} className="btn-primary text-xs py-2 px-4">
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Keys'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
