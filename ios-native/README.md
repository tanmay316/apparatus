# iOS build setup

Native iOS sources + setup for building the `.ipa`. The same `src/` powers Android,
iOS, the website and the PWA — only this folder is iOS-specific.

## One-time setup (on the Mac)

```bash
npm run ios:setup       # creates ios/, installs native sources, patches Info.plist/Podfile/storyboard, syncs
npx cap open ios        # opens App.xcworkspace in Xcode
```

`setup-ios.sh` + `patch-ios.cjs` handle automatically:

- Copies `AppDelegate.swift` (Firebase Messaging → FCM token), `MainViewController.swift`
  (registers the app-target `WorkoutLocation` plugin — Capacitor 6+ does **not** auto-register
  plugins that live in the app target) and the GPS engine sources, and adds them to the target.
- Points `Main.storyboard` at `MainViewController`.
- Adds `pod 'FirebaseMessaging'` to the Podfile.
- Adds `GoogleService-Info.plist`, the Google Sign-In URL scheme (`REVERSED_CLIENT_ID`),
  all privacy strings, background modes and `ITSAppUsesNonExemptEncryption = NO`.

Then in Xcode → target **App** → *Signing & Capabilities* (paid Apple Developer account):

1. Select your Team (bundle id `com.tms.apparatus`).
2. **+ Capability** → *Push Notifications*.
3. **+ Capability** → *Background Modes* → tick **Location updates**, **Remote notifications**,
   **Background fetch**.
4. **+ Capability** → *Sign in with Apple* (App Store guideline 4.8 — required because the app
   offers Google sign-in).

One-time console setup:

- **Firebase → Project settings → Cloud Messaging → Apple app configuration**: upload an APNs
  Auth Key (.p8) from developer.apple.com → Keys. Without it iOS devices never receive pushes.
- **Firebase → Authentication → Sign-in method → Apple**: enable it (no Services ID needed for
  native iOS sign-in).

CI (`.github/workflows/build-ios.yml`) needs a repository secret **`ENV_FILE`** holding the full
contents of `.env`, otherwise the bundle throws "Missing required environment variables" at launch.
The CI build is unsigned; sideloading with a free Apple ID cannot use Push or Sign in with Apple
(Google and email login still work).

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
| Media (music) controls card | Yes | Hidden (iOS doesn't let apps control other apps' playback) |
| Daily step count | Steps from tracked walks/runs | Whole-day iPhone step count (CoreMotion), tracked sessions as floor |
| Session steps | Live step counter + gap fill if Android paused sensor delivery | Exact CoreMotion history query over active (unpaused) time |
| Sign-in | Google, email | Apple, Google, email |
