import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { AlarmClock, CalendarClock, MessageCircle, Moon, RotateCcw, Shield, ShieldAlert, Trophy, Users } from 'lucide-react';
import { Switch, Toggle } from '@/components/ui/Toggle';
import { SettingRow, SettingsSection } from '@/components/settings/SettingsLayout';
import { useUIStore } from '@/stores/ui-store';
import { useAuthStore } from '@/stores/auth-store';
import { isAdminUser } from '@/lib/firebase';
import { useNotificationPrefs, type NotificationCategory } from '@/stores/notification-prefs-store';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '@/utils/notifications';

const CATEGORY_ROWS: { id: NotificationCategory; label: string; description: string; icon: typeof Users }[] = [
  { id: 'social', label: 'Social', description: 'Likes, comments, follows and cheers', icon: Users },
  { id: 'chat', label: 'Clan chat', description: 'New messages', icon: MessageCircle },
  { id: 'clans', label: 'Clan activity', description: 'Posts, polls and join requests', icon: Shield },
  { id: 'events', label: 'Events and challenges', description: 'Start times, registrations and results', icon: CalendarClock },
  { id: 'achievements', label: 'Progress', description: 'Badges, rank-ups, volume changes and step goals', icon: Trophy },
  { id: 'reminders', label: 'Reminders', description: 'Workout reminders and comeback nudges', icon: AlarmClock },
];

const ADMIN_ROW = { id: 'admin' as const, label: 'Admin alerts', description: 'New reports, community and event requests', icon: ShieldAlert };

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_PRESETS = [
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekdays', days: [1, 2, 3, 4, 5] },
  { label: 'Mon, Wed, Fri', days: [1, 3, 5] },
];

const PERMISSION_LABEL: Record<NotificationPermissionState, { text: string; className: string }> = {
  granted: { text: 'On', className: 'dx-pill dx-pill--success' },
  prompt: { text: 'Off', className: 'dx-pill dx-pill--neutral' },
  denied: { text: 'Blocked', className: 'dx-pill dx-pill--neutral' },
  unsupported: { text: 'Unavailable', className: 'dx-pill dx-pill--neutral' },
};

const timeInput = 'dx-input font-mono !w-[116px] !min-h-[38px] !py-1.5';

export function NotificationSettings() {
  const prefs = useNotificationPrefs();
  const { showToast } = useUIStore();
  const [permission, setPermission] = useState<NotificationPermissionState>('prompt');
  const isNative = Capacitor.isNativePlatform();
  const isAdmin = isAdminUser(useAuthStore(s => s.user));

  useEffect(() => {
    getNotificationPermissionState().then(setPermission).catch(() => setPermission('unsupported'));
  }, []);

  const enable = async () => {
    const granted = await requestNotificationPermission();
    setPermission(granted ? 'granted' : await getNotificationPermissionState());
    if (!granted) showToast('Notifications were not allowed', 'error');
  };

  const toggleDay = (day: number) => {
    const days = prefs.reminderDays.includes(day) ? prefs.reminderDays.filter(d => d !== day) : [...prefs.reminderDays, day];
    prefs.setPrefs({ reminderDays: days.sort() });
  };

  const bannersOff = !prefs.bannersEnabled;
  const remindersOff = bannersOff || !prefs.categories.reminders;
  const status = PERMISSION_LABEL[permission];

  return (
    <>
      <SettingsSection id="notifications" title="Notifications" description="Choose what alerts you. The bell keeps everything either way.">
        <SettingRow
          label={isNative ? 'Device notifications' : 'Browser notifications'}
          description={permission === 'denied' ? `Allow Apparatus in your ${isNative ? 'phone' : 'browser'} settings.` : undefined}
        >
          <div className="flex items-center gap-2">
            <span className={status.className}>{status.text}</span>
            {permission === 'prompt' && (
              <button type="button" onClick={enable} className="dx-btn !h-9 !px-4 !text-[13px]">Turn on</button>
            )}
          </div>
        </SettingRow>
        <SettingRow label="Pop-up alerts" description="Master switch for every banner and sound.">
          <Switch checked={prefs.bannersEnabled} onChange={v => prefs.setPrefs({ bannersEnabled: v })} label="Pop-up alerts" />
        </SettingRow>
        {(isAdmin ? [...CATEGORY_ROWS, ADMIN_ROW] : CATEGORY_ROWS).map(row => (
          <Toggle
            key={row.id}
            checked={prefs.categories[row.id]}
            onChange={v => prefs.setCategory(row.id, v)}
            disabled={bannersOff}
            icon={<row.icon size={16} />}
            label={row.label}
            description={row.description}
          />
        ))}
        <div className="pb-3.5 space-y-1">
          <Toggle
            checked={prefs.quietHours}
            onChange={v => prefs.setPrefs({ quietHours: v })}
            disabled={bannersOff}
            icon={<Moon size={16} />}
            label="Quiet hours"
            description="No pop-ups during this window."
          />
          {prefs.quietHours && !bannersOff && (
            <div className="flex items-center gap-2 text-[13px] dx-muted sm:pl-12">
              <input type="time" aria-label="Quiet hours start" className={timeInput} value={prefs.quietStart} onChange={e => e.target.value && prefs.setPrefs({ quietStart: e.target.value })} />
              <span>to</span>
              <input type="time" aria-label="Quiet hours end" className={timeInput} value={prefs.quietEnd} onChange={e => e.target.value && prefs.setPrefs({ quietEnd: e.target.value })} />
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection id="reminders" title="Reminders" description={isNative ? 'Scheduled on your phone, even when the app is closed.' : 'Shown in the bell while Apparatus is open.'}>
        <div className="pb-3.5 space-y-1">
          <Toggle
            checked={prefs.workoutReminders}
            onChange={v => prefs.setPrefs({ workoutReminders: v })}
            disabled={remindersOff}
            icon={<AlarmClock size={16} />}
            label="Workout reminder"
            description="Skipped on days you've already trained."
          />
          {prefs.workoutReminders && !remindersOff && (
            <div className="sm:pl-12 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <input type="time" aria-label="Reminder time" className={timeInput} value={prefs.reminderTime} onChange={e => e.target.value && prefs.setPrefs({ reminderTime: e.target.value })} />
                {DAY_PRESETS.map(preset => {
                  const active = preset.days.length === prefs.reminderDays.length && preset.days.every(d => prefs.reminderDays.includes(d));
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => prefs.setPrefs({ reminderDays: preset.days })}
                      className={`dx-chip ${active ? '!bg-[var(--dx-accent-soft)] !text-[var(--dx-accent)]' : ''}`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5" role="group" aria-label="Reminder days">
                {WEEKDAYS.map((d, i) => {
                  const on = prefs.reminderDays.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      aria-pressed={on}
                      aria-label={WEEKDAY_NAMES[i]}
                      className="w-9 h-9 rounded-full text-[12px] font-semibold transition-colors"
                      style={on
                        ? { background: 'var(--dx-accent)', color: 'var(--dx-on-accent)' }
                        : { background: 'var(--dx-card-2)', color: 'var(--dx-muted)' }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
              {!prefs.reminderDays.length && <p className="text-[12px]" style={{ color: 'var(--dx-warning)' }}>Pick at least one day.</p>}
            </div>
          )}
        </div>
        <Toggle
          checked={prefs.inactivityReminders}
          onChange={v => prefs.setPrefs({ inactivityReminders: v })}
          disabled={remindersOff}
          icon={<RotateCcw size={16} />}
          label="Comeback nudges"
          description="After 3, 7 and 14 days without training."
        />
        <div className="py-3 flex justify-end">
          <button
            type="button"
            onClick={() => { prefs.reset(); showToast('Notification settings restored'); }}
            className="dx-link !text-[12.5px]"
          >
            Restore defaults
          </button>
        </div>
      </SettingsSection>
    </>
  );
}
