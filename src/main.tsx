import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { useAuthStore } from './stores/auth-store';
import { logError } from '@/services/logger';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import './index.css';
import { SocialLogin } from '@capgo/capacitor-social-login';

// Initialize Firebase auth listener
useAuthStore.getState().init();

// Initialize Social Login
SocialLogin.initialize({
  google: {
    webClientId: '716398124057-hhg54cto4lnft33chuh0gmb5ofkp4qki.apps.googleusercontent.com',
    mode: 'online',
  },
}).catch(console.error);

// Notify Capgo that the bundle loaded successfully so it doesn't rollback
CapacitorUpdater.notifyAppReady();

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
