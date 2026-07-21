import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Key, Shield, Save } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store';

export default function AdminNutritionSettings() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    use_admin_keys: false,
    nvidia_api_key: '',
    gemini_api_key: '',
    openrouter_api_key: ''
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function loadSettings() {
      if (!profile?.isAdmin) return;
      try {
        const docRef = doc(db, 'admin_settings', 'api_keys');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setSettings(docSnap.data() as any);
        }
      } catch (err) {
        console.error("Error loading admin settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await setDoc(doc(db, 'admin_settings', 'api_keys'), settings);
      setMessage('Settings saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!profile?.isAdmin) return null;
  if (loading) return <div className="p-4 text-bone-dim animate-pulse">Loading settings...</div>;

  return (
    <div className="card p-6 border-sienna/20">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-sienna/20 flex items-center justify-center">
          <Shield className="text-sienna" size={20} />
        </div>
        <div>
          <h2 className="text-lg font-display text-bone font-semibold">Global AI Settings</h2>
          <p className="text-xs text-bone-dim">Manage the API keys for the AI Nutrition Agent.</p>
        </div>
      </div>

      <div className="space-y-5">
        <label className="flex items-center gap-3 cursor-pointer p-4 rounded-xl bg-white/[0.02] border border-line">
          <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={settings.use_admin_keys}
              onChange={(e) => setSettings({ ...settings, use_admin_keys: e.target.checked })}
            />
            <div className="w-11 h-6 bg-ink-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sienna"></div>
          </div>
          <div>
            <div className="text-sm font-medium text-bone">Use Global Admin Keys</div>
            <div className="text-xs text-bone-dim mt-0.5">
              If enabled, all users will use these API keys instead of their own personal keys.
            </div>
          </div>
        </label>

        {settings.use_admin_keys && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs text-bone-dim mb-1.5 uppercase tracking-wider font-semibold">Nvidia API Key (Primary)</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" size={16} />
                <input
                  type="password"
                  value={settings.nvidia_api_key}
                  onChange={(e) => setSettings({ ...settings, nvidia_api_key: e.target.value })}
                  className="w-full bg-ink border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-bone focus:outline-none focus:border-sienna transition-colors"
                  placeholder="nvapi-..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-bone-dim mb-1.5 uppercase tracking-wider font-semibold">Gemini API Key (Fallback)</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" size={16} />
                <input
                  type="password"
                  value={settings.gemini_api_key}
                  onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
                  className="w-full bg-ink border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-bone focus:outline-none focus:border-sienna transition-colors"
                  placeholder="AIza..."
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-bone-dim mb-1.5 uppercase tracking-wider font-semibold">OpenRouter API Key (Fallback)</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-bone-dim" size={16} />
                <input
                  type="password"
                  value={settings.openrouter_api_key}
                  onChange={(e) => setSettings({ ...settings, openrouter_api_key: e.target.value })}
                  className="w-full bg-ink border border-line rounded-xl pl-10 pr-4 py-2.5 text-sm text-bone focus:outline-none focus:border-sienna transition-colors"
                  placeholder="sk-or-v1-..."
                />
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 flex items-center justify-between">
          <div className="text-xs text-sienna-light">{message}</div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
