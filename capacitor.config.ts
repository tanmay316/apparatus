import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tms.apparatus',
  appName: 'apparatus',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '716398124057-hhg54cto4lnft33chuh0gmb5ofkp4qki.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      androidSplashResourceName: 'splash'
    }
  }
};

export default config;
