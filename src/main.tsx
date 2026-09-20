import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { useAuthStore } from './stores/auth-store';
import { logError } from '@/services/logger';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import './index.css';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';

// Initialize Firebase auth listener
useAuthStore.getState().init();

// Initialize Social Login.
// iOS native Google Sign-In needs its own OAuth client id (the web one is not
// accepted by the native SDK); without it the native call fails and we fall back
// to the web OAuth flow in auth-store. iOSServerClientId must be the web client id
// so the returned idToken carries the audience Firebase Auth expects.
const GOOGLE_WEB_CLIENT_ID = '716398124057-hhg54cto4lnft33chuh0gmb5ofkp4qki.apps.googleusercontent.com';
SocialLogin.initialize({
  google: {
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || undefined,
    iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
    mode: 'online',
  },
}).catch(console.error);

// Global unhandled error logging
window.addEventListener('error', (event) => {
  logError(event.error || new Error(event.message), 'window_onerror');
});

// Global unhandled promise rejection logging
window.addEventListener('unhandledrejection', (event) => {
  logError(event.reason || new Error('Unhandled Promise Rejection'), 'unhandled_rejection');
});

// Initialize PWA elements for Capacitor (e.g., Camera overlay)
defineCustomElements(window);

// Register the PWA service worker for web/installed-PWA only. Native builds ship
// their assets in the app bundle and use OTA updates, so a SW there would only
// risk serving stale content.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
