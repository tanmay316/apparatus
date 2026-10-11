import { Capacitor } from '@capacitor/core';

// Android reports the system-bar insets even on phones where the WebView already sits
// below/above the bars, so we check the WebView's real size against the screen and only
// pad for bars that actually overlap it. Result goes to --app-sat / --app-sab (variables.css).

const KEYBOARD_MIN_PX = 150;
const root = document.documentElement;
const heightRef: Record<string, number> = {};
let statusBarHeight = 0;
let probe: HTMLDivElement | null = null;
let scheduled = false;

function cssPx(name: string): number {
  return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
}

function envInsets(): { top: number; bottom: number } {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  return { top: parseFloat(s.paddingTop) || 0, bottom: parseFloat(s.paddingBottom) || 0 };
}

function setVar(name: string, px: number) {
  const value = `${Math.round(px)}px`;
  if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
}

function measure() {
  scheduled = false;
  const env = envInsets();
  const reportedTop = Math.max(cssPx('--safe-area-inset-top'), env.top);
  const reportedBottom = Math.max(cssPx('--safe-area-inset-bottom'), env.bottom);
  const statusBar = statusBarHeight || reportedTop;

  const screenH = window.screen.height;
  const key = screenH >= window.screen.width ? 'portrait' : 'landscape';
  const h = window.innerHeight;
  // A big shrink is the keyboard, not a layout change; keep the full height then.
  if (heightRef[key] === undefined || h >= heightRef[key] - KEYBOARD_MIN_PX) heightRef[key] = h;

  // Screen space the WebView does not cover (bars it was laid out around).
  const uncovered = Math.max(0, screenH - heightRef[key]);
  const underStatusBar = statusBar > 0 && uncovered < statusBar / 2;
  const top = underStatusBar ? Math.max(statusBar, reportedTop) : 0;
  const rest = underStatusBar ? uncovered : uncovered - statusBar;
  const bottom = reportedBottom > 0 && rest < reportedBottom / 2 ? reportedBottom : 0;

  setVar('--app-sat', top);
  setVar('--app-sab', bottom);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(measure);
}

async function readStatusBar() {
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    const info = await StatusBar.getInfo();
    statusBarHeight = info.visible ? info.height || 0 : 0;
  } catch {
    statusBarHeight = 0;
  }
  schedule();
}

/** Re-check after anything that can move the WebView (status bar changes, resume, rotation). */
export function refreshSafeArea() {
  if (Capacitor.getPlatform() !== 'android') return;
  void readStatusBar();
}

export function initSafeArea() {
  if (Capacitor.getPlatform() !== 'android') return;
  refreshSafeArea();
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', refreshSafeArea);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSafeArea(); });
  // Capacitor's SystemBars writes --safe-area-inset-* onto <html> whenever insets change.
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ['style'] });
  // Window layout settles a moment after launch.
  setTimeout(refreshSafeArea, 400);
  setTimeout(refreshSafeArea, 1500);
}
