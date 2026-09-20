# iOS build setup

Native iOS sources + setup for building the `.ipa`. The same `src/` powers Android,
iOS, the website and the PWA — only this folder is iOS-specific.

## One-time setup (on the Mac)

```bash
npm run ios:setup       # creates ios/, installs plugin sources, patches Info.plist, syncs
npx cap open ios        # opens Xcode
```

Then in Xcode:

1. **Add the Swift files to the target** if they aren't already listed under `App`:
   `GpsKalmanFilter.swift`, `WorkoutLocationStore.swift`, `WorkoutLocationManager.swift`,
   `WorkoutLocationPlugin.swift` (File → Add Files to "App"…, check *Add to target: App*).
2. **Firebase**: download `GoogleService-Info.plist` from Firebase Console → Project
   Settings → your iOS app (bundle id `com.tms.apparatus`) and drag it into the `App` target.
3. **Signing & Capabilities** → add:
   - *Push Notifications*
   - *Background Modes* → tick **Location updates** and **Remote notifications**
4. **Google Sign-In**: copy `CLIENT_ID` from `GoogleService-Info.plist` into `.env` as
   `VITE_GOOGLE_IOS_CLIENT_ID=...`, then add its **reversed** form
   (`com.googleusercontent.apps.…`) as a URL Scheme under *Info → URL Types*.
   Rebuild the web bundle after editing `.env` (`npm run ios:sync`).

## Day-to-day

```bash
npm run ios:sync        # rebuild web assets + recopy Swift sources + cap sync
```

## How background cardio tracking works on iOS

`WorkoutLocationManager` is the iOS counterpart of Android's `WorkoutLocationService`.
Distance, speed, elevation and the route are accumulated **in native Swift**, not in
JavaScript, so they keep recording correctly when the app is backgrounded, the cardio
screen is popped, or the screen is locked. The WebView only renders state the native
layer owns and re-syncs via `getSessionSummary()` when the app returns to the foreground.

The quality pipeline is ported 1:1 from Android so both platforms produce the same
numbers: accuracy gate (55 m) → Kalman coordinate smoothing → Doppler cross-check →
spike/teleport rejection → EMA speed → movement hysteresis (3 samples to start, 5 to
stop) → distance gate → elevation threshold.

Key requirements, all applied by `setup-ios.sh`:

- `UIBackgroundModes` includes `location`
- `NSLocationAlwaysAndWhenInUseUsageDescription` is set (Always keeps it running reliably)
- `pausesLocationUpdatesAutomatically = false` — otherwise iOS silently freezes distance
- `allowsBackgroundLocationUpdates = true` + significant-location-change as a relaunch net

## Platform differences that are intentional

| Behaviour | Android | iOS |
| --- | --- | --- |
| Ongoing workout notification | Foreground service w/ PAUSE/STOP buttons | Ongoing local notification (no action buttons — iOS has no equivalent) |
| Background GPS | Custom foreground service | `CLLocationManager` + location background mode |
| Battery-optimization prompt | Opens OS settings | No-op; reports Always-authorization instead |
| Notification channels | Required (Android 8+) | Not applicable |
