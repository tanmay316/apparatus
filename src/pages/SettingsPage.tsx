import { useEffect, useState, useRef, type ReactNode } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, ChevronRight, Download, Footprints, Globe2, KeyRound, Lock, LogOut, Palette, Scale, Trash2, Upload, User, UserCheck, Users,
  Trophy, BarChart3, AlarmClock,
} from 'lucide-react';
import { deleteUser } from 'firebase/auth';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { Toggle } from '@/components/ui/Toggle';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { Segmented, SettingRow, SettingsSection } from '@/components/settings/SettingsLayout';
import PersonalAISettings from '@/components/settings/PersonalAISettings';
import { useAuthStore } from '@/stores/auth-store';
import { useUIStore } from '@/stores/ui-store';
import { useWorkoutStore } from '@/stores/workout-store';
import { deleteAccountData, deleteAvatar, downloadJson, exportAccountData, resetUserData, uploadAvatar } from '@/services/account';
import { DEFAULT_STEP_GOAL, getStepsForDate } from '@/services/cardio';
import { getAvatarUrl } from '@/lib/avatar';
import { localDateKey } from '@/lib/stats';
import { acceptAllFollowRequests, restrictPublicContent } from '@/services/social';
import { computeAthleteRank } from '@/lib/rank';
import type { UserProfile } from '@/types';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'body', label: 'Body and training', icon: Scale },
  { id: 'goals', label: 'Daily goals', icon: Footprints },
  { id: 'privacy', label: 'Privacy', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'reminders', label: 'Reminders', icon: AlarmClock },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI keys', icon: KeyRound },
  { id: 'data', label: 'Your data', icon: Download },
  { id: 'account', label: 'Account', icon: LogOut },
];

const STEP_PRESETS = [6000, 8000, 10000, 12000, 15000];

const GENDERS = ['', 'Male', 'Female', 'Non-binary', 'Prefer not to say'];
const FITNESS_GOALS = ['', 'Build Muscle', 'Lose Fat', 'Increase Strength', 'Learn Skills (Handstand, Planche)', 'Endurance & Conditioning', 'General Health'];

const VISIBILITY_OPTIONS: { value: 'public' | 'followers' | 'private'; label: string; description: string; icon: typeof Globe2 }[] = [
  { value: 'public', label: 'Public', description: 'Anyone can see your profile and follow you.', icon: Globe2 },
  { value: 'followers', label: 'Followers', description: 'Only followers can see your profile.', icon: Users },
  { value: 'private', label: 'Private', description: 'You approve every new follower.', icon: UserCheck },
];

const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function UnitInput({ id, unit, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { unit: string }) {
  return (
    <div className="relative w-full sm:w-44">
      <input id={id} type="number" inputMode="decimal" className="dx-input pr-12 tabular" {...props} />
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] dx-muted pointer-events-none">{unit}</span>
    </div>
  );
}

function ProgressBlock({ label, pct, danger }: { label: string; pct: number; danger?: boolean }) {
  return (
    <div className="w-full sm:w-64">
      <div className="flex justify-between text-[12px] mb-1.5">
        <span className="dx-muted truncate">{label}</span>
        <span className="tabular font-semibold">{pct}%</span>
      </div>
      <div className="dx-progress">
        <span style={{ width: `${pct}%`, ...(danger ? { background: '#dc2626' } : {}) }} />
      </div>
    </div>
  );
}

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

function SettingsForm({ profile }: { profile: UserProfile }) {
  const { user, stats, updateProfile, signOut } = useAuthStore();
  const { showToast, confirm, theme, setTheme, units, setUnits, language, setLanguage } = useUIStore();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [age, setAge] = useState(profile.age?.toString() || '');
  const [gender, setGender] = useState(profile.gender || '');
  const [fitnessGoal, setFitnessGoal] = useState(profile.fitnessGoal || '');
  const [preferredWorkoutType, setPreferredWorkoutType] = useState(profile.preferredWorkoutType || '');
  const [stepGoal, setLocalStepGoal] = useState((profile.stepGoal || DEFAULT_STEP_GOAL).toString());

  const defaultVisibility = profile.privacySettings?.profileVisibility || (profile.isPublic === false ? 'private' : 'public');
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'followers' | 'private'>(defaultVisibility);
  const [showEvents, setShowEvents] = useState(profile.privacySettings?.showEventsToFollowers !== false);
  const [showClans, setShowClans] = useState(profile.privacySettings?.showClansToFollowers !== false);
  const [showStats, setShowStats] = useState(profile.privacySettings?.showStatsToFollowers !== false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Keeps long-running operations alive if the user navigates away.
  const deleteOpRef = useRef<Promise<void> | null>(null);
  const resetOpRef = useRef<Promise<void> | null>(null);

  const [deleteProgressMsg, setDeleteProgressMsg] = useState('');
  const [deleteProgressPct, setDeleteProgressPct] = useState(0);
  const [resetProgressMsg, setResetProgressMsg] = useState('');
  const [resetProgressPct, setResetProgressPct] = useState(0);

  const cancelWorkout = useWorkoutStore(state => state.cancelWorkout);
  const today = localDateKey();
  const { data: stepsToday = 0 } = useQuery({
    queryKey: ['stepsToday', profile.uid, today],
    queryFn: () => getStepsForDate(profile.uid, today),
  });

  useEffect(() => {
    setHeight(profile.height == null ? '' : (units === 'imperial' ? (profile.height / 2.54).toFixed(1) : profile.height.toString()));
    setWeight(profile.weight == null ? '' : (units === 'imperial' ? (profile.weight * 2.20462).toFixed(1) : profile.weight.toString()));
  }, [units, profile]);

  // Deep links such as /settings#notifications from the bell.
  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return;
    const t = setTimeout(() => scrollToSection(id), 250);
    return () => clearTimeout(t);
  }, [hash]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, { rootMargin: '-20% 0px -65% 0px' });
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleSaveField = async (updates: Partial<UserProfile>) => {
    try {
      await updateProfile(updates);
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
    }
  };

  const saveStepGoal = (value: number) => {
    const goal = Math.min(100000, Math.max(1000, Math.round(value / 100) * 100 || DEFAULT_STEP_GOAL));
    setLocalStepGoal(goal.toString());
    if (goal !== profile.stepGoal) handleSaveField({ stepGoal: goal });
  };

  const savePrivacy = (patch: Partial<NonNullable<UserProfile['privacySettings']>>) => handleSaveField({
    privacySettings: {
      ...(profile.privacySettings || {}),
      profileVisibility,
      showEventsToFollowers: showEvents,
      showClansToFollowers: showClans,
      showStatsToFollowers: showStats,
      ...patch,
    },
  });

  const changeVisibility = async (newValue: 'public' | 'followers' | 'private') => {
    if (newValue === profileVisibility) return;
    const previous = profileVisibility;
    setProfileVisibility(newValue);
    await handleSaveField({
      isPublic: newValue === 'public',
      privacySettings: {
        ...(profile.privacySettings || {}),
        profileVisibility: newValue,
        showEventsToFollowers: showEvents,
        showClansToFollowers: showClans,
        showStatsToFollowers: showStats,
      },
    });
    if (!user) return;
    try {
      if (previous === 'private' && newValue !== 'private') {
        const approved = await acceptAllFollowRequests(user.uid);
        if (approved > 0) showToast(`${approved} pending follow request${approved === 1 ? '' : 's'} approved`);
      }
      if (newValue !== 'public') await restrictPublicContent(user.uid);
    } catch (err) {
      console.warn('Privacy follow-up failed', err);
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
      showToast('Profile photo updated');
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

    // Deleting the auth user requires a recent login; check up front instead of failing at the end.
    const lastSignIn = new Date(user.metadata.lastSignInTime || 0).getTime();
    if (Date.now() - lastSignIn > 5 * 60 * 1000) {
      showToast('For security, sign out and sign back in right before deleting your account.', 'error');
      return;
    }

    const confirmed = await confirm({
      title: 'Delete Account',
      message: 'This permanently deletes your workouts, plans, measurements, social activity, profile and login. This cannot be undone.',
      confirmText: 'Delete Account',
      type: 'danger',
      icon: 'trash',
    });
    if (!confirmed) return;
    setDeleting(true);
    setDeleteProgressMsg('Starting deletion...');
    setDeleteProgressPct(0);

    const op = (async () => {
      try {
        await deleteAccountData(user.uid, profile.username, (msg, pct) => {
          setDeleteProgressMsg(msg);
          setDeleteProgressPct(pct);
        });
        setDeleteProgressMsg('Removing avatar...');
        setDeleteProgressPct(95);
        try { await deleteAvatar(user.uid); } catch (e) { console.warn('Avatar delete failed', e); }
        setDeleteProgressMsg('Removing login...');
        setDeleteProgressPct(98);
        await deleteUser(user);
        setDeleteProgressMsg('Done');
        setDeleteProgressPct(100);
        showToast('Account deleted');
        navigate('/auth');
      } catch (error: any) {
        showToast(error?.message || 'Account deletion failed. Please sign in again and retry.', 'error');
      } finally {
        setDeleting(false);
      }
    })();
    deleteOpRef.current = op;
    await op;
  };

  const handleResetData = async () => {
    if (!user || !profile) return;
    const confirmed = await confirm({
      title: 'Reset All Data',
      message: 'This removes your workouts, plans, measurements, skills, social activity, followers, notifications, clan memberships, event registrations, challenges, cardio and custom exercises. Your login and username stay. This cannot be undone.',
      confirmText: 'Reset Data',
      type: 'danger',
      icon: 'alert',
    });
    if (!confirmed) return;
    setResetting(true);
    setResetProgressMsg('Starting data reset...');
    setResetProgressPct(0);

    const op = (async () => {
      try {
        await resetUserData(user.uid, (msg, pct) => {
          setResetProgressMsg(msg);
          setResetProgressPct(pct);
        });
        try { await deleteAvatar(user.uid); } catch (avatarError) { console.warn('Avatar cleanup skipped:', avatarError); }
        cancelWorkout();
        await useAuthStore.getState().refreshProfile();
        showToast('All personal data has been reset');
      } catch (error: any) {
        showToast(error?.message || 'Data reset failed. Please retry.', 'error');
      } finally {
        setResetting(false);
      }
    })();
    resetOpRef.current = op;
    await op;
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Sign Out',
      message: 'Sign out of Apparatus on this device?',
      confirmText: 'Sign Out',
      type: 'warning',
      icon: 'logout',
    });
    if (confirmed) {
      await signOut();
      navigate('/auth');
    }
  };

  const rank = computeAthleteRank(stats, profile.weight, { gender: profile.gender });
  const avatar = photoURL || user?.photoURL || getAvatarUrl(profile.displayName, theme);
  const stepGoalValue = Number(stepGoal) || DEFAULT_STEP_GOAL;
  const stepPct = Math.round((stepsToday / stepGoalValue) * 100);
  const weightUnit = units === 'imperial' ? 'lb' : 'kg';
  const heightUnit = units === 'imperial' ? 'in' : 'cm';

  const navButton = (section: typeof SECTIONS[number], compact = false): ReactNode => {
    const active = activeSection === section.id;
    return (
      <button
        key={section.id}
        type="button"
        onClick={() => scrollToSection(section.id)}
        aria-current={active ? 'true' : undefined}
        className={compact
          ? 'dx-chip shrink-0 !h-8 !px-3 !text-[12.5px]'
          : 'w-full flex items-center gap-2.5 h-9 px-3 rounded-xl text-[13.5px] font-medium text-left transition-colors'}
        style={active
          ? { background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' }
          : compact ? undefined : { color: 'var(--dx-muted)' }}
      >
        <section.icon size={compact ? 13 : 16} /> {section.label}
      </button>
    );
  };

  return (
    <div className="dx pro-scope max-w-6xl mx-auto pt-1 sm:pt-4 pb-16">
      <header className="mb-5 px-1">
        <h1 className="text-[26px] sm:text-[30px] font-semibold tracking-tight leading-tight">Settings</h1>
        <p className="text-[14px] dx-muted mt-1">Manage your account, privacy and how Apparatus works for you.</p>
      </header>

      <nav aria-label="Settings sections" className="lg:hidden -mx-1 px-1 mb-5 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {SECTIONS.map(s => navButton(s, true))}
      </nav>

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block">
          <nav aria-label="Settings sections" className="sticky top-20 space-y-0.5">
            {SECTIONS.map(s => navButton(s))}
          </nav>
        </aside>

        <div className="space-y-9 min-w-0 max-w-3xl">
          {/* Account summary */}
          <div className="dx-card p-4 sm:p-5 flex items-center gap-4">
            <img
              src={avatar}
              alt=""
              className="w-16 h-16 rounded-full object-cover shrink-0"
              style={{ border: '1px solid var(--dx-border)' }}
              referrerPolicy="no-referrer"
              onError={e => { (e.target as HTMLImageElement).src = getAvatarUrl(profile.displayName, theme); }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-semibold truncate">{profile.displayName || 'Athlete'}</div>
              <div className="text-[13px] dx-muted truncate">@{profile.username}{user?.email ? ` · ${user.email}` : ''}</div>
              <Link to="/ranks" className="dx-pill dx-pill--accent mt-1.5 hover:opacity-85">
                <Trophy size={11} /> {rank.label}
              </Link>
            </div>
            <Link to={`/profile/${profile.username}`} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px] hidden sm:inline-flex">
              View profile
            </Link>
          </div>

          <SettingsSection id="profile" title="Profile" description="How other athletes see you.">
            <SettingRow label="Photo" description="JPG, PNG or WebP up to 5 MB.">
              <div className="flex items-center gap-3">
                <img src={avatar} alt="" className="w-10 h-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                <label className="dx-btn-secondary !h-9 !px-3.5 !text-[13px] cursor-pointer">
                  <Upload size={14} /> {uploadingAvatar ? 'Uploading…' : 'Upload'}
                  <input type="file" accept="image/*" className="sr-only" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                </label>
              </div>
            </SettingRow>
            <SettingRow label="Display name" htmlFor="displayName">
              <input
                id="displayName"
                type="text"
                required
                maxLength={50}
                className="dx-input sm:max-w-sm"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onBlur={() => displayName.trim() && displayName !== profile.displayName && handleSaveField({ displayName: displayName.trim() })}
              />
            </SettingRow>
            <SettingRow label="Username" description="Usernames can't be changed.">
              <div className="dx-input sm:max-w-sm font-mono flex items-center dx-muted">@{profile.username}</div>
            </SettingRow>
            <div className="py-3.5">
              <label htmlFor="bio" className="block text-[14px] font-medium mb-2" style={{ color: 'var(--dx-text)' }}>Bio</label>
              <textarea
                id="bio"
                maxLength={500}
                className="dx-input"
                placeholder="Your training focus, goals or favourite skills"
                value={bio}
                onChange={e => setBio(e.target.value)}
                onBlur={() => bio !== profile.bio && handleSaveField({ bio })}
              />
              <div className="text-right text-[11px] dx-muted mt-1 tabular">{bio.length}/500</div>
            </div>
            <SettingRow label="Photo URL" description="Use a hosted image instead of uploading." htmlFor="photoURL">
              <input
                id="photoURL"
                type="url"
                className="dx-input sm:max-w-sm font-mono !text-[12.5px]"
                placeholder="https://"
                value={photoURL}
                onChange={e => setPhotoURL(e.target.value)}
                onBlur={() => photoURL !== profile.photoURL && handleSaveField({ photoURL })}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="body" title="Body and training" description="Used for calories, strength standards and your athlete rank.">
            <SettingRow label="Height" htmlFor="height">
              <UnitInput
                id="height"
                unit={heightUnit}
                value={height}
                onChange={e => setHeight(e.target.value)}
                onBlur={() => handleSaveField({ height: height ? (units === 'imperial' ? parseFloat(height) * 2.54 : parseFloat(height)) : null })}
              />
            </SettingRow>
            <SettingRow label="Weight" description="Strength is judged relative to bodyweight." htmlFor="weight">
              <UnitInput
                id="weight"
                unit={weightUnit}
                step="0.1"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                onBlur={() => handleSaveField({ weight: weight ? (units === 'imperial' ? parseFloat(weight) / 2.20462 : parseFloat(weight)) : null })}
              />
            </SettingRow>
            <SettingRow label="Age" htmlFor="age">
              <UnitInput
                id="age"
                unit="yrs"
                value={age}
                onChange={e => setAge(e.target.value)}
                onBlur={() => handleSaveField({ age: age ? parseInt(age) : null })}
              />
            </SettingRow>
            <SettingRow label="Sex" description="Sets the strength and pace standards.">
              <CustomSelect
                className="w-full sm:w-56"
                value={gender}
                onChange={val => { setGender(val); handleSaveField({ gender: val }); }}
                options={GENDERS.map(g => ({ value: g, label: g || 'Not set' }))}
              />
            </SettingRow>
            <SettingRow label="Main goal">
              <CustomSelect
                className="w-full sm:w-64"
                value={fitnessGoal}
                onChange={val => { setFitnessGoal(val); handleSaveField({ fitnessGoal: val }); }}
                options={FITNESS_GOALS.map(g => ({ value: g, label: g || 'Not set' }))}
              />
            </SettingRow>
            <SettingRow label="Preferred training" htmlFor="preferredTraining">
              <input
                id="preferredTraining"
                type="text"
                placeholder="e.g. Ring calisthenics"
                className="dx-input sm:max-w-sm"
                value={preferredWorkoutType}
                onChange={e => setPreferredWorkoutType(e.target.value)}
                onBlur={() => preferredWorkoutType !== profile.preferredWorkoutType && handleSaveField({ preferredWorkoutType })}
              />
            </SettingRow>
            <Link to="/ranks" className="py-3.5 flex items-center gap-3 group">
              <span className="dx-badge-icon !w-9 !h-9 !rounded-xl"><Trophy size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-medium">Athlete rank</div>
                <div className="text-[12.5px] dx-muted">{rank.label} · {rank.score}/1000</div>
              </div>
              <ChevronRight size={16} className="dx-muted group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </SettingsSection>

          <SettingsSection id="goals" title="Daily goals" description="Tracked from your walks and runs.">
            <SettingRow label="Step goal" description={`Today: ${stepsToday.toLocaleString()} steps (${stepPct}%)`} htmlFor="stepGoal">
              <div className="relative w-full sm:w-44">
                <input
                  id="stepGoal"
                  type="number"
                  inputMode="numeric"
                  min={1000}
                  step={500}
                  className="dx-input pr-14 tabular"
                  value={stepGoal}
                  onChange={e => setLocalStepGoal(e.target.value)}
                  onBlur={() => saveStepGoal(Number(stepGoal))}
                />
                <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] dx-muted pointer-events-none">steps</span>
              </div>
            </SettingRow>
            <div className="py-3.5 space-y-3">
              <div className="flex flex-wrap gap-2">
                {STEP_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => saveStepGoal(preset)}
                    className="dx-chip tabular"
                    style={stepGoalValue === preset ? { background: 'var(--dx-accent-soft)', color: 'var(--dx-accent)' } : undefined}
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="dx-progress">
                <span style={{ width: `${Math.min(100, stepPct)}%`, ...(stepPct >= 100 ? { background: 'var(--dx-success)' } : {}) }} />
              </div>
              <p className="text-[12.5px] dx-muted">
                {stepPct >= 100
                  ? 'Goal reached today.'
                  : `${Math.max(0, stepGoalValue - stepsToday).toLocaleString()} steps to go. You get a notification when you hit it.`}
              </p>
            </div>
          </SettingsSection>

          <SettingsSection id="privacy" title="Privacy" description="Control who sees your profile and training.">
            <div className="py-4">
              <div className="text-[14px] font-medium mb-2.5">Profile visibility</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Profile visibility">
                {VISIBILITY_OPTIONS.map(option => {
                  const selected = profileVisibility === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => changeVisibility(option.value)}
                      className="text-left p-3.5 rounded-2xl transition-colors"
                      style={{
                        background: selected ? 'var(--dx-accent-soft)' : 'var(--dx-card-2)',
                        boxShadow: selected ? 'inset 0 0 0 1.5px var(--dx-accent)' : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: selected ? 'var(--dx-accent)' : 'var(--dx-text)' }}>
                        <option.icon size={16} /> {option.label}
                      </div>
                      <div className="text-[12px] dx-muted mt-1 leading-snug">{option.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <Toggle
              icon={<Trophy size={16} />}
              checked={showEvents}
              onChange={checked => { setShowEvents(checked); savePrivacy({ showEventsToFollowers: checked }); }}
              label="Show events and competitions"
              description="Your registrations and results"
            />
            <Toggle
              icon={<Users size={16} />}
              checked={showClans}
              onChange={checked => { setShowClans(checked); savePrivacy({ showClansToFollowers: checked }); }}
              label="Show clans"
              description="The clans you belong to and your role"
            />
            <Toggle
              icon={<BarChart3 size={16} />}
              checked={showStats}
              onChange={checked => { setShowStats(checked); savePrivacy({ showStatsToFollowers: checked }); }}
              label="Show stats"
              description="Workouts, calories and streaks"
            />
          </SettingsSection>

          <NotificationSettings />

          <SettingsSection id="appearance" title="Appearance" description="Saved on this device.">
            <SettingRow label="Theme">
              <Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            </SettingRow>
            <SettingRow label="Units" description="Measurements are stored in metric.">
              <Segmented label="Units" value={units} onChange={setUnits} options={[{ value: 'metric', label: 'kg, cm' }, { value: 'imperial', label: 'lb, in' }]} />
            </SettingRow>
            <SettingRow label="Language">
              <Segmented label="Language" value={language} onChange={setLanguage} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="ai" title="AI keys" description="For AI nutrition features.">
            <PersonalAISettings />
          </SettingsSection>

          <SettingsSection id="data" title="Your data">
            <SettingRow label="Export account data" description="Profile, plans, workouts, measurements, skills and activity as JSON.">
              <button type="button" onClick={handleExport} disabled={exporting} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]">
                <Download size={14} /> {exporting ? 'Preparing…' : 'Export'}
              </button>
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="account" title="Account">
            <SettingRow label="Sign out" description="Sign out on this device.">
              <button type="button" onClick={handleLogout} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]">
                <LogOut size={14} /> Sign out
              </button>
            </SettingRow>
          </SettingsSection>

          <SettingsSection id="danger" title="Danger zone" danger>
            <SettingRow label="Reset all data" description="Clears your training history, social activity and memberships. Your login and username stay.">
              {resetting ? (
                <ProgressBlock label={resetProgressMsg} pct={resetProgressPct} />
              ) : (
                <button type="button" onClick={handleResetData} disabled={deleting} className="dx-btn-secondary !h-9 !px-3.5 !text-[13px]" style={{ color: '#dc2626' }}>
                  Reset data
                </button>
              )}
            </SettingRow>
            <SettingRow label="Delete account" description="Permanently removes your account and all data.">
              {deleting ? (
                <ProgressBlock label={deleteProgressMsg} pct={deleteProgressPct} danger />
              ) : (
                <button type="button" onClick={handleDeleteAccount} disabled={resetting} className="dx-btn !h-9 !px-3.5 !text-[13px]" style={{ background: '#dc2626', color: '#fff' }}>
                  <Trash2 size={14} /> Delete account
                </button>
              )}
            </SettingRow>
            {(deleting || resetting) && (
              <p className="py-3 text-[12px] dx-muted">Keep the app open. You can switch pages while this finishes.</p>
            )}
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
