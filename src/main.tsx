import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { useAuthStore } from './stores/auth-store';
import { logError } from '@/services/logger';
import './index.css';

// Initialize Firebase auth listener
useAuthStore.getState().init();

// Global unhandled error logging
window.addEventListener('error', (event) => {
  logError(event.error || new Error(event.message), 'window_onerror');
});

// Global unhandled promise rejection logging
window.addEventListener('unhandledrejection', (event) => {
  logError(event.reason || new Error('Unhandled Promise Rejection'), 'unhandled_rejection');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
