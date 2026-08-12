import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.apparatus.apparatus',
  appName: 'Apparatus',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      appId: 'com.apparatus.apparatus'
    },
    GoogleAuth: {
      scopes: [
        'profile',
        'email'
      ],
      serverClientId: '716398124057-hhg54cto4lnft33chuh0gmb5ofkp4qki.apps.googleusercontent.com',
      forceCodeForRefreshToken: true
    },
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      androidSplashResourceName: 'splash'
    }
  }
};

export default config;
