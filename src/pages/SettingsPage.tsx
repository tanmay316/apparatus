import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Save, LogOut, Check, User, Scale, Eye, Upload, Download, Trash2, Sun, Moon, Globe, Ruler } from 'lucide-react';
import { deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { googleProvider } from '@/lib/firebase';
import { deleteAccountData, deleteAvatar, downloadJson, exportAccountData, resetUserData, uploadAvatar } from '@/services/account';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
};

export function SettingsPage() {
  const { user, profile, updateProfile, signOut } = useAuthStore();
  const { showToast, theme, units, language, setTheme, setUnits, setLanguage } = useUIStore();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [bio, setBio] = useState(profile?.bio || '');
  
  const [height, setHeight] = useState(profile?.height == null ? '' : (units === 'imperial' ? (profile.height / 2.54).toFixed(1) : profile.height.toString()));
  const [weight, setWeight] = useState(profile?.weight == null ? '' : (units === 'imperial' ? (profile.weight * 2.20462).toFixed(1) : profile.weight.toString()));
  const [age, setAge] = useState(profile?.age?.toString() || '');
  const [gender, setGender] = useState(profile?.gender || '');
  const [fitnessGoal, setFitnessGoal] = useState(profile?.fitnessGoal || '');
  const [experienceLevel, setExperienceLevel] = useState(profile?.experienceLevel || 'beginner');
  const [preferredWorkoutType, setPreferredWorkoutType] = useState(profile?.preferredWorkoutType || '');
  const [isPublic, setIsPublic] = useState(profile?.isPublic !== false);

  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const cancelWorkout = useWorkoutStore(state => state.cancelWorkout);

  useEffect(() => {
    if (!profile) return;
    setHeight(profile.height == null ? '' : (units === 'imperial' ? (profile.height / 2.54).toFixed(1) : profile.height.toString()));
    setWeight(profile.weight == null ? '' : (units === 'imperial' ? (profile.weight * 2.20462).toFixed(1) : profile.weight.toString()));
  }, [units]);

  if (!profile) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      await updateProfile({
        displayName,
        photoURL,
        bio,
        height: height ? (units === 'imperial' ? parseFloat(height) * 2.54 : parseFloat(height)) : null,
        weight: weight ? (units === 'imperial' ? parseFloat(weight) / 2.20462 : parseFloat(weight)) : null,
        age: age ? parseInt(age) : null,
        gender,
        fitnessGoal,
        experienceLevel: experienceLevel as 'beginner' | 'intermediate' | 'advanced',
        preferredWorkoutType,
        isPublic,
      });
      setSuccess(true);
      showToast('Settings saved successfully!');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to save settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(user.uid, file);
      await updateProfile({ photoURL: url });
      setPhotoURL(url);
      showToast('Profile photo uploaded');
    } catch (error: any) {
      showToast(error?.message || 'Could not upload profile photo', 'error');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const data = await exportAccountData(user.uid);
      downloadJson(data, `apparatus-export-${new Date().toISOString().slice(0, 10)}.json`);
      showToast('Your account export is ready');
    } catch (error: any) {
      showToast(error?.message || 'Could not export account data', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !profile) return;
    const confirmed = confirm('This permanently deletes your workouts, plans, measurements, social activity, profile, and login. This cannot be undone. Continue?');
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteAccountData(user.uid, profile.username);
      await deleteAvatar(user.uid);
      try {
        await deleteUser(user);
      } catch (error: any) {
        if (error?.code !== 'auth/requires-recent-login') throw error;
        await reauthenticateWithPopup(user, googleProvider);
        await deleteUser(user);
      }
      showToast('Account deleted');
      navigate('/auth');
    } catch (error: any) {
      showToast(error?.message || 'Account deletion failed. Please sign in again and retry.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleResetData = async () => {
    if (!user || !profile) return;
    const confirmed = confirm('Reset all your workouts, plans, measurements, skills, social activity, followers, notifications, custom exercises, and profile details? Your login account and username will remain. This cannot be undone.');
    if (!confirmed) return;
    setResetting(true);
    try {
      await resetUserData(user.uid);
      try { await deleteAvatar(user.uid); } catch (avatarError) { console.warn('Avatar cleanup skipped:', avatarError); }
      cancelWorkout();
      await useAuthStore.getState().refreshProfile();
      showToast('All personal data has been reset');
    } catch (error: any) {
      showToast(error?.message || 'Data reset failed. Please retry.', 'error');
    } finally {
      setResetting(false);
    }
  };

  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
      await signOut();
      navigate('/auth');
    }
  };

  const GENDERS = ['', 'Male', 'Female', 'Non-binary', 'Prefer not to say'];
  const FITNESS_GOALS = [
    '',
    'Build Muscle',
    'Lose Fat',
    'Increase Strength',
    'Learn Skills (Handstand, Planche)',
    'Endurance & Conditioning',
    'General Health'
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 max-w-4xl">
      {/* Header */}
      <motion.div variants={item} className="pb-5 border-b border-line mb-6 flex items-center justify-between">
        <div>
          <div className="font-mono text-amber text-xs tracking-widest mb-1">PREFERENCES</div>
          <h1 className="font-display text-3xl mb-1">Settings</h1>
          <p className="text-bone-dim text-sm max-w-xl">Manage your profile, physical measurements, and system preferences.</p>
        </div>
        <button
          onClick={handleLogout}
          className="btn-secondary py-2 text-xs flex items-center gap-2 hover:text-danger hover:border-danger/30"
        >
          <LogOut size={14} /> Logout
        </button>
      </motion.div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* left: Profile settings */}
          <motion.div variants={item} className="card p-5 md:col-span-2 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
              <User size={18} className="text-teal" />
              <h3 className="font-display text-base uppercase tracking-wide text-bone">Profile Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Display Name</label>
                <input
                  type="text"
                  required
                  className="input-field bg-ink-2"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Profile Username (Read Only)</label>
                <input
                  type="text"
                  disabled
                  className="input-field bg-ink opacity-65 font-mono"
                  value={`@${profile.username}`}
                />
              </div>
            </div>

            <div>
              <label className="label">Avatar URL</label>
              <input
                type="url"
                className="input-field bg-ink-2 font-mono text-xs"
                placeholder="https://example.com/avatar.jpg"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <label className="btn-secondary py-2 text-xs inline-flex items-center gap-2 cursor-pointer">
                  <Upload size={13} /> {uploadingAvatar ? 'Uploading...' : 'Upload image'}
                  <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                </label>
                <p className="text-[10px] text-bone-dim">JPG, PNG, or WebP up to 5 MB.</p>
              </div>
            </div>

            <div>
              <label className="label">Bio</label>
              <textarea
                className="input-field bg-ink-2 text-sm h-20 resize-none"
                placeholder="Tell other athletes about your training goals..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
          </motion.div>

          {/* right: Avatar preview & Actions */}
          <motion.div variants={item} className="card p-5 md:col-span-1 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative group">
              <img
                src={photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=4F9E8D&color=14151A&bold=true&size=128`}
                alt={displayName}
                className="w-24 h-24 rounded-full border-2 border-teal object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <h4 className="font-display text-lg">{displayName}</h4>
              <p className="font-mono text-xs text-bone-dim">@{profile.username}</p>
            </div>
            <div className="w-full pt-4 border-t border-line/30 space-y-3">
              {success && (
                <div className="text-xs text-teal font-mono bg-teal/10 p-2 rounded border border-teal/20 flex items-center justify-center gap-1">
                  <Check size={14} /> Saved successfully!
                </div>
              )}
              <button
                type="submit"
                disabled={saving}
                className="btn-primary w-full py-2 flex items-center justify-center gap-2"
              >
                <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </motion.div>
        </div>

        {/* Physical Details & Fitness */}
        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            <Scale size={18} className="text-teal" />
            <h3 className="font-display text-base uppercase tracking-wide text-bone">Physical Details</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="label">Height ({units === 'imperial' ? 'in' : 'cm'})</label>
              <input
                type="number"
                placeholder="Height"
                className="input-field bg-ink-2 font-mono"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Weight ({units === 'imperial' ? 'lb' : 'kg'})</label>
              <input
                type="number"
                step="0.1"
                placeholder="Weight"
                className="input-field bg-ink-2 font-mono"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Age</label>
              <input
                type="number"
                placeholder="Age"
                className="input-field bg-ink-2 font-mono"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Gender</label>
              <select
                className="input-field bg-ink-2"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g || 'Select Gender'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Fitness Goal</label>
              <select
                className="input-field bg-ink-2"
                value={fitnessGoal}
                onChange={(e) => setFitnessGoal(e.target.value)}
              >
                {FITNESS_GOALS.map((g) => (
                  <option key={g} value={g}>
                    {g || 'Select Goal'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Experience Level</label>
              <select
                className="input-field bg-ink-2 capitalize"
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value as 'beginner' | 'intermediate' | 'advanced')}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="label">Preferred Training</label>
              <input
                type="text"
                placeholder="e.g. Ring Calisthenics"
                className="input-field bg-ink-2"
                value={preferredWorkoutType}
                onChange={(e) => setPreferredWorkoutType(e.target.value)}
              />
            </div>
          </div>
        </motion.div>

        {/* Privacy preferences */}
        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            <Eye size={18} className="text-teal" />
            <h3 className="font-display text-base uppercase tracking-wide text-bone">Privacy Settings</h3>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="isPublic"
              className="mt-1 accent-teal cursor-pointer"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <div>
              <label htmlFor="isPublic" className="font-bold text-sm text-bone cursor-pointer select-none">
                Make Profile Public
              </label>
              <p className="text-xs text-bone-dim leading-relaxed">
                When enabled, other athletes can discover your account in the Explore tab, follow you, and see your public activity posts in the feed.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            {theme === 'dark' ? <Moon size={18} className="text-teal" /> : <Sun size={18} className="text-amber" />}
            <h3 className="font-display text-base uppercase tracking-wide text-bone">App Preferences</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Theme</label>
              <select className="input-field bg-ink-2" value={theme} onChange={(event) => setTheme(event.target.value as 'dark' | 'light')}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
            <div>
              <label className="label flex items-center gap-1"><Ruler size={12} /> Units</label>
              <select className="input-field bg-ink-2" value={units} onChange={(event) => setUnits(event.target.value as 'metric' | 'imperial')}>
                <option value="metric">Metric · kg / cm</option>
                <option value="imperial">Imperial · lb / in</option>
              </select>
            </div>
            <div>
              <label className="label flex items-center gap-1"><Globe size={12} /> Language</label>
              <select className="input-field bg-ink-2" value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'hi')}>
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-bone-dim">Theme, units, and language are saved locally and apply immediately. Profile measurements remain stored in metric for consistent analytics.</p>
        </motion.div>

        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            <Download size={18} className="text-teal" />
            <h3 className="font-display text-base uppercase tracking-wide text-bone">Your Data</h3>
          </div>
          <p className="text-sm text-bone-dim leading-relaxed">Download a JSON copy of your profile, plans, workouts, measurements, skills, activities, and notifications.</p>
          <button type="button" onClick={handleExport} disabled={exporting} className="btn-secondary inline-flex items-center gap-2">
            <Download size={14} /> {exporting ? 'Preparing export...' : 'Export account data'}
          </button>
        </motion.div>

        <motion.div variants={item} className="card p-5 border-danger/30 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-danger/20 mb-2">
            <Trash2 size={18} className="text-danger" />
            <h3 className="font-display text-base uppercase tracking-wide text-danger">Danger Zone</h3>
          </div>
          <p className="text-sm text-bone-dim leading-relaxed">Delete your Firebase profile and all data permanently. Google may ask you to sign in again before the account credential can be removed.</p>
          <button type="button" onClick={handleDeleteAccount} disabled={deleting} className="btn-danger inline-flex items-center gap-2">
            <Trash2 size={14} /> {deleting ? 'Deleting account...' : 'Delete account permanently'}
          </button>
          <div className="pt-4 border-t border-danger/20 space-y-3">
            <div><h4 className="font-semibold text-sm text-amber">Reset personal data</h4><p className="text-xs text-bone-dim leading-relaxed mt-1">Keeps your login and username, but removes your workouts, plans, body logs, skills, social relationships, notifications, custom exercises, and personal profile details.</p></div>
            <button type="button" onClick={handleResetData} disabled={resetting || deleting} className="btn-secondary border-amber/40 text-amber inline-flex items-center gap-2">
              <Trash2 size={14} /> {resetting ? 'Resetting data...' : 'Reset all my data'}
            </button>
          </div>
        </motion.div>
      </form>
    </motion.div>
  );
}
