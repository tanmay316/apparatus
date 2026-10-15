import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Timers are anchored to wall-clock time: a locked phone freezes the WebView's JS, so counting
// interval ticks stopped the clock. Finishing while locked is announced by a scheduled notification.

const ALERT_LATE_MS = 5000;

async function scheduleAlert(id: number, at: number, body: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: 'Timer done',
        body,
        schedule: { at: new Date(at), allowWhileIdle: true },
        channelId: 'general_notifications',
        smallIcon: 'ic_notification',
        iconColor: '#e07a5f',
        autoCancel: true,
      }],
    });
  } catch { /* alert is best-effort */ }
}

function cancelAlert(id: number) {
  if (!Capacitor.isNativePlatform()) return;
  LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
}

/** Re-runs `tick` every 500 ms and whenever the app becomes visible again. */
function useTicker(active: boolean, tick: () => void) {
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!active) return;
    const run = () => tickRef.current();
    run();
    const id = setInterval(run, 500);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', run);
    };
  }, [active]);
}

export function useCountdownTimer(initialSec: number, alertId: number, alertText: string, onDone: () => void) {
  const [left, setLeft] = useState(initialSec);
  const [running, setRunning] = useState(false);
  const endRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const remaining = () => Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000));

  useTicker(running, () => {
    const sec = remaining();
    setLeft(sec);
    if (sec === 0) {
      setRunning(false);
      // Only sound in-app if we caught it live; otherwise the notification already alerted.
      if (Date.now() - endRef.current < ALERT_LATE_MS) onDoneRef.current();
    }
  });

  useEffect(() => () => cancelAlert(alertId), [alertId]);

  const start = (seconds = left) => {
    if (seconds <= 0) return;
    endRef.current = Date.now() + seconds * 1000;
    setLeft(seconds);
    setRunning(true);
    void scheduleAlert(alertId, endRef.current, alertText);
  };

  /** Pauses (keeps the remaining time) or, with `seconds`, stops and sets a new value. */
  const stop = (seconds?: number) => {
    setLeft(seconds ?? (running ? remaining() : left));
    setRunning(false);
    cancelAlert(alertId);
  };

  return { left, running, start, stop, toggle: () => (running ? stop() : start()) };
}

export function useStopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const baseRef = useRef(0);

  const current = () => Math.floor((Date.now() - baseRef.current) / 1000);
  useTicker(running, () => setElapsed(current()));

  const toggle = () => {
    if (running) {
      setElapsed(current());
      setRunning(false);
    } else {
      baseRef.current = Date.now() - elapsed * 1000;
      setRunning(true);
    }
  };
  const reset = () => {
    setElapsed(0);
    setRunning(false);
  };

  return { elapsed, running, toggle, reset };
}
