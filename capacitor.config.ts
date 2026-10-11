import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'fs';

// OTA bundles are tied to this native version, so a new APK never boots an older downloaded web bundle.
const nativeVersion: string = JSON.parse(readFileSync('package.json', 'utf8')).nativeVersion;
const brand: { name: string; appId: string } = JSON.parse(readFileSync('brand.config.json', 'utf8'));

const config: CapacitorConfig = {
  appId: brand.appId,
  appName: brand.name,
  webDir: 'dist',
  plugins: {
    OtaKit: {
      appId: "a7c5429c-6e01-44bf-804c-24d3e8cb2441",
      runtimeVersion: nativeVersion
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
      presentationOptions: ["badge", "sound", "alert"]
    },
    StatusBar: {
      overlaysWebView: false
    }
  },
  ios: {
    // The UI already handles notch/home-indicator spacing via env(safe-area-inset-*)
    // together with viewport-fit=cover, so let the webview render edge-to-edge
    // instead of insetting it natively (which would double the padding).
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#00000000'
  },
  server: {
    // The WebView origin. Changing it would wipe every installed user's saved login and offline data.
    hostname: 'apparatus.app',
    androidScheme: 'https',
    iosScheme: 'capacitor'
  }
};

export default config;
