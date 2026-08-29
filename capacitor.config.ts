import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tms.apparatus',
  appName: 'Apparatus',
  webDir: 'dist',
  plugins: {
    OtaKit: {
      appId: "a7c5429c-6e01-44bf-804c-24d3e8cb2441"
    },
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      androidSplashResourceName: 'splash'
    },
    LocalNotifications: {
      smallIcon: 'ic_notification',
      iconColor: '#e07a5f'
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound"]
    }
  },
  server: {
    hostname: 'apparatus.app',
    androidScheme: 'https',
    iosScheme: 'capacitor'
  }
};

export default config;
