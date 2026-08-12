import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ImagePlus, Loader2, Save, Trash2, Crown, Eye, User, Globe, Ruler, MapPin, Download, Sun, Moon, Upload, Check, Scale, LogOut, Footprints } from 'lucide-react';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { useAuthStore } from '@/stores/auth-store';
import PersonalAISettings from '@/components/settings/PersonalAISettings';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { usePedometerStore } from '@/stores/pedometer-store';
import { googleProvider } from '@/lib/firebase';
import { deleteAccountData, deleteAvatar, downloadJson, exportAccountData, resetUserData, uploadAvatar } from '@/services/account';
import { getAvatarUrl } from '@/lib/avatar';
import type { UserProfile } from '@/types';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
};

export function SettingsPage() {
  const { profile } = useAuthStore();
  
  if (!profile) {
    return (
      <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-ink/20 border-t-ink/80 rounded-full animate-spin" />
      </div>
    );
  }

  return <SettingsForm profile={profile} />;
}

function SettingsForm({ profile }: { profile: any }) { console.log('PROFILE DATA:', profile);
  const { user, updateProfile, signOut } = useAuthStore();
  const { showToast, theme, setTheme, units, setUnits, language, setLanguage } = useUIStore();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [bio, setBio] = useState(profile.bio || '');
  
  const [height, setHeight] = useState(profile.height == null ? '' : (units === 'imperial' ? (profile.height / 2.54).toFixed(1) : profile.height.toString()));
  const [weight, setWeight] = useState(profile.weight == null ? '' : (units === 'imperial' ? (profile.weight * 2.20462).toFixed(1) : profile.weight.toString()));
  const [age, setAge] = useState(profile.age?.toString() || '');
  const [gender, setGender] = useState(profile.gender || '');
  const [fitnessGoal, setFitnessGoal] = useState(profile.fitnessGoal || '');
  const [experienceLevel, setExperienceLevel] = useState(profile.experienceLevel || 'beginner');
  const [preferredWorkoutType, setPreferredWorkoutType] = useState(profile.preferredWorkoutType || '');
  const [isPublic, setIsPublic] = useState(profile.isPublic !== false);
  const [stepGoal, setLocalStepGoal] = useState((profile.stepGoal || 10000).toString());
  
  // Use legacy isPublic as fallback if privacySettings is undefined
  const defaultVisibility = profile.privacySettings?.profileVisibility || (profile.isPublic === false ? 'private' : 'public');
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers' | 'private'>(defaultVisibility);
  
  const [showEvents, setShowEvents] = useState(profile.privacySettings?.showEventsToFollowers !== false);
  const [showClans, setShowClans] = useState(profile.privacySettings?.showClansToFollowers !== false);
  const [showStats, setShowStats] = useState(profile.privacySettings?.showStatsToFollowers !== false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const cancelWorkout = useWorkoutStore(state => state.cancelWorkout);

  useEffect(() => {
    setHeight(profile.height == null ? '' : (units === 'imperial' ? (profile.height / 2.54).toFixed(1) : profile.height.toString()));
    setWeight(profile.weight == null ? '' : (units === 'imperial' ? (profile.weight * 2.20462).toFixed(1) : profile.weight.toString()));
  }, [units, profile]);

  const handleSaveField = async (updates: Partial<UserProfile & { stepGoal?: number }>) => {
    try {
      await updateProfile(updates);
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
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
      </motion.div>

      <div className="space-y-6">
        <div className="space-y-6">
          {/* Profile settings */}
          <motion.div variants={item} className="card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
              <User size={18} className="text-sienna" />
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
                  onBlur={() => handleSaveField({ displayName })}
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
                onBlur={() => handleSaveField({ photoURL })}
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
                onBlur={() => handleSaveField({ bio })}
              />
            </div>
            
            <PersonalAISettings />
          </motion.div>

        </div>

        {/* Physical Details & Fitness */}
        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            <Scale size={18} className="text-sienna" />
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
                onBlur={() => handleSaveField({ height: height ? (units === 'imperial' ? parseFloat(height) * 2.54 : parseFloat(height)) : null })}
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
                onBlur={() => handleSaveField({ weight: weight ? (units === 'imperial' ? parseFloat(weight) / 2.20462 : parseFloat(weight)) : null })}
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
                onBlur={() => handleSaveField({ age: age ? parseInt(age) : null })}
              />
            </div>
            <div>
              <label className="label">Gender</label>
              <CustomSelect
                className="w-full"
                value={gender}
                onChange={(val) => { setGender(val); handleSaveField({ gender: val }); }}
                options={GENDERS.map(g => ({ value: g, label: g || 'Select Gender' }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Fitness Goal</label>
              <CustomSelect
                className="w-full"
                value={fitnessGoal}
                onChange={(val) => { setFitnessGoal(val); handleSaveField({ fitnessGoal: val }); }}
                options={FITNESS_GOALS.map(g => ({ value: g, label: g || 'Select Goal' }))}
              />
            </div>
            <div>
              <label className="label">Experience Level</label>
              <CustomSelect
                className="w-full capitalize"
                value={experienceLevel}
                onChange={(val) => {
                  const level = val as 'beginner' | 'intermediate' | 'advanced';
                  setExperienceLevel(level);
                  handleSaveField({ experienceLevel: level });
                }}
                options={[
                  { value: 'beginner', label: 'Beginner' },
                  { value: 'intermediate', label: 'Intermediate' },
                  { value: 'advanced', label: 'Advanced' }
                ]}
              />
            </div>
            <div>
              <label className="label">Preferred Training</label>
              <input
                type="text"
                placeholder="e.g. Ring Calisthenics"
                className="input-field bg-ink-2"
                value={preferredWorkoutType}
                onChange={(e) => setPreferredWorkoutType(e.target.value)}
                onBlur={() => handleSaveField({ preferredWorkoutType })}
              />
            </div>
          </div>
        </motion.div>

        {/* Privacy preferences */}
        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            <Eye size={18} className="text-sienna" />
            <h3 className="font-display text-base uppercase tracking-wide text-bone">Privacy Settings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="label">Account Visibility</label>
              <CustomSelect
                className="w-full"
                value={profileVisibility}
                onChange={(val) => {
                  const newValue = val as 'public' | 'followers' | 'private';
                  setProfileVisibility(newValue);
                  handleSaveField({
                    isPublic: newValue === 'public',
                    privacySettings: {
                      profileVisibility: newValue,
                      showEventsToFollowers: showEvents,
                      showClansToFollowers: showClans,
                      showStatsToFollowers: showStats
                    }
                  });
                }}
                options={[
                  { value: 'public', label: 'Public (Everyone can follow & view)' },
                  { value: 'followers', label: 'Followers Only (Must follow to view)' },
                  { value: 'private', label: 'Private (Requests required to follow)' }
                ]}
              />
              <p className="text-[10px] text-bone-dim mt-1.5 leading-relaxed">
                {profileVisibility === 'public' ? 'Your profile, workouts, and stats are visible to everyone.' : profileVisibility === 'followers' ? 'Only people who follow you can see your profile.' : 'New followers must be approved by you.'}
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <label className="label">Profile Features (For Followers)</label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="mt-1 accent-sienna" checked={showEvents} onChange={(e) => {
                  const checked = e.target.checked;
                  setShowEvents(checked);
                  handleSaveField({
                    privacySettings: { profileVisibility, showEventsToFollowers: checked, showClansToFollowers: showClans, showStatsToFollowers: showStats }
                  });
                }} />
                <div>
                  <span className="text-sm font-bold text-bone">Show Events & Competitions</span>
                  <p className="text-[10px] text-bone-dim leading-tight">Display your event ranks and registrations on your profile.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="mt-1 accent-sienna" checked={showClans} onChange={(e) => {
                  const checked = e.target.checked;
                  setShowClans(checked);
                  handleSaveField({
                    privacySettings: { profileVisibility, showEventsToFollowers: showEvents, showClansToFollowers: checked, showStatsToFollowers: showStats }
                  });
                }} />
                <div>
                  <span className="text-sm font-bold text-bone">Show Clan Affiliations</span>
                  <p className="text-[10px] text-bone-dim leading-tight">Display the clans you belong to and your roles.</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="mt-1 accent-sienna" checked={showStats} onChange={(e) => {
                  const checked = e.target.checked;
                  setShowStats(checked);
                  handleSaveField({
                    privacySettings: { profileVisibility, showEventsToFollowers: showEvents, showClansToFollowers: showClans, showStatsToFollowers: checked }
                  });
                }} />
                <div>
                  <span className="text-sm font-bold text-bone">Show Overall Stats</span>
                  <p className="text-[10px] text-bone-dim leading-tight">Display your total workouts, calories, and streaks.</p>
                </div>
              </label>
            </div>
          </div>
        </motion.div>

        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            {theme === 'dark' ? <Moon size={18} className="text-sienna" /> : <Sun size={18} className="text-amber" />}
            <h3 className="font-display text-base uppercase tracking-wide text-bone">App Preferences</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Theme</label>
              <CustomSelect
                className="w-full"
                value={theme}
                onChange={(val) => setTheme(val as 'dark' | 'light')}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' }
                ]}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1"><Ruler size={12} /> Units</label>
              <CustomSelect
                className="w-full"
                value={units}
                onChange={(val) => setUnits(val as 'metric' | 'imperial')}
                options={[
                  { value: 'metric', label: 'Metric · kg / cm' },
                  { value: 'imperial', label: 'Imperial · lb / in' }
                ]}
              />
            </div>
            <div>
              <label className="label flex items-center gap-1"><Globe size={12} /> Language</label>
              <CustomSelect
                className="w-full"
                value={language}
                onChange={(val) => setLanguage(val as 'en' | 'hi')}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'hi', label: 'हिन्दी' }
                ]}
              />
            </div>
          </div>
          <div className="space-y-4 border-t border-line/20 pt-4 mt-4">
            <div className="flex items-center gap-3">
              <label className="label w-32 shrink-0">Daily Step Goal</label>
              <input
                type="number"
                className="input-field bg-ink-2 max-w-[150px]"
                value={stepGoal}
                onChange={(e) => setLocalStepGoal(e.target.value)}
                onBlur={() => handleSaveField({ stepGoal: parseInt(stepGoal) || 10000 })}
                min="1000"
                step="500"
              />
            </div>
          </div>
          <p className="text-xs text-bone-dim mt-4">Theme, units, and language are saved locally and apply immediately. Profile measurements remain stored in metric for consistent analytics.</p>
        </motion.div>

        <motion.div variants={item} className="card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            <Download size={18} className="text-sienna" />
            <h3 className="font-display text-base uppercase tracking-wide text-bone">Your Data</h3>
          </div>
          <p className="text-sm text-bone-dim leading-relaxed">Download a JSON copy of your profile, plans, workouts, measurements, skills, activities, and notifications.</p>
          <button type="button" onClick={handleExport} disabled={exporting} className="btn-secondary inline-flex items-center gap-2">
            <Download size={14} /> {exporting ? 'Preparing export...' : 'Export account data'}
          </button>
        </motion.div>

        <motion.div variants={item} className="card p-5 space-y-4 border-t-4 border-amber/40">
          <div className="flex items-center gap-2 pb-2 border-b border-line/30 mb-2">
            <LogOut size={18} className="text-amber" />
            <h3 className="font-display text-base uppercase tracking-wide text-amber">Account Access</h3>
          </div>
          <p className="text-sm text-bone-dim leading-relaxed">Sign out of your current session on this device.</p>
          <button type="button" onClick={handleLogout} className="btn-secondary border-amber/40 text-amber hover:bg-amber/10 inline-flex items-center gap-2">
            <LogOut size={14} /> Sign Out
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
      </div>
    </motion.div>
  );
}
