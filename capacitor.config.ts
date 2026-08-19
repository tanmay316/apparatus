import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tms.apparatus',
  appName: 'Apparatus',
  webDir: 'dist',
  plugins: {
    CapacitorUpdater: {
      autoUpdate: true,
      appId: 'com.tms.apparatus'
    },
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      androidSplashResourceName: 'splash'
    },
    LocalNotifications: {
      smallIcon: 'ic_notification',
      iconColor: '#e07a5f'
    }
  },
  server: {
    hostname: 'apparatus.app',
    androidScheme: 'https',
    iosScheme: 'capacitor'
  }
};

export default config;
