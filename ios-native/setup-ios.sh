#!/bin/bash
# ---------------------------------------------------------------------------
# Apparatus — iOS platform setup (run on macOS with Xcode + CocoaPods)
#
#   ./ios-native/setup-ios.sh
#
# Idempotent: safe to re-run after pulling changes. It creates the iOS platform
# if missing, installs the custom background-location plugin sources, and
# patches Info.plist with the permission/background-mode keys the app needs.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

IOS_APP_DIR="$ROOT/ios/App/App"
PLIST="$IOS_APP_DIR/Info.plist"
SRC_DIR="$ROOT/ios-native/App"

echo "==> Installing npm dependencies"
npm install

echo "==> Running iOS dependency patches"
node "$ROOT/ios-native/patch-ios.cjs"

if [ ! -d "$ROOT/ios" ]; then
  echo "==> Creating iOS platform (using CocoaPods)"
  npx cap add ios --packagemanager cocoapods
else
  echo "==> iOS platform already exists, skipping 'cap add'"
fi

echo "==> Applying post-add patches"
node "$ROOT/ios-native/patch-ios.cjs"

echo "==> Building web assets"
npm run build

echo "==> Installing native WorkoutLocation plugin sources"
cp "$SRC_DIR/GpsKalmanFilter.swift"       "$IOS_APP_DIR/"
cp "$SRC_DIR/WorkoutLocationStore.swift"  "$IOS_APP_DIR/"
cp "$SRC_DIR/WorkoutLocationManager.swift" "$IOS_APP_DIR/"
cp "$SRC_DIR/WorkoutLocationPlugin.swift" "$IOS_APP_DIR/"
if [ -f "$SRC_DIR/GoogleService-Info.plist" ]; then
  echo "==> Installing GoogleService-Info.plist"
  cp "$SRC_DIR/GoogleService-Info.plist" "$IOS_APP_DIR/"
fi

echo "==> Patching Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" >/dev/null 2>&1 || true; }

# Location — Always is required so distance keeps accruing with the app closed.
pb "Delete :NSLocationWhenInUseUsageDescription"
pb "Add :NSLocationWhenInUseUsageDescription string 'Apparatus uses your location to map your route and measure distance, pace and elevation during walks, runs and rides.'"
pb "Delete :NSLocationAlwaysAndWhenInUseUsageDescription"
pb "Add :NSLocationAlwaysAndWhenInUseUsageDescription string 'Apparatus needs background location so your route, distance and pace keep recording accurately when the screen is off or you switch apps mid-workout.'"
pb "Delete :NSLocationAlwaysUsageDescription"
pb "Add :NSLocationAlwaysUsageDescription string 'Apparatus needs background location so your route, distance and pace keep recording accurately when the screen is off or you switch apps mid-workout.'"

# Motion — step counting via the pedometer.
pb "Delete :NSMotionUsageDescription"
pb "Add :NSMotionUsageDescription string 'Apparatus uses motion data to count your steps during walks and runs.'"

# Camera / photo library — profile photos and community post images.
pb "Delete :NSCameraUsageDescription"
pb "Add :NSCameraUsageDescription string 'Apparatus uses the camera so you can take profile and progress photos.'"
pb "Delete :NSPhotoLibraryUsageDescription"
pb "Add :NSPhotoLibraryUsageDescription string 'Apparatus needs photo access so you can pick profile and community post images.'"
pb "Delete :NSPhotoLibraryAddUsageDescription"
pb "Add :NSPhotoLibraryAddUsageDescription string 'Apparatus saves your workout and medal share cards to your photo library.'"

# Background modes — 'location' keeps CoreLocation delivering while backgrounded,
# 'remote-notification' lets FCM data pushes wake the app.
pb "Delete :UIBackgroundModes"
pb "Add :UIBackgroundModes array"
pb "Add :UIBackgroundModes:0 string location"
pb "Add :UIBackgroundModes:1 string remote-notification"
pb "Add :UIBackgroundModes:2 string fetch"

# Match the Android splash/status-bar behaviour.
pb "Delete :UIViewControllerBasedStatusBarAppearance"
pb "Add :UIViewControllerBasedStatusBarAppearance bool false"

echo "==> Registering native files in App.xcodeproj"
ruby -e '
  begin
    require "xcodeproj"
    project_path = "ios/App/App.xcodeproj"
    if File.exist?(project_path)
      project = Xcodeproj::Project.open(project_path)
      app_target = project.targets.find { |t| t.name == "App" }
      app_group = project.main_group.find_subpath("App", true)
      
      files = [
        "GpsKalmanFilter.swift",
        "WorkoutLocationStore.swift",
        "WorkoutLocationManager.swift",
        "WorkoutLocationPlugin.swift",
        "GoogleService-Info.plist"
      ]
      
      files.each do |file_name|
        full_path = File.join("ios/App/App", file_name)
        next unless File.exist?(full_path)
        
        existing = app_group.files.find { |f| f.path == file_name || f.path == "App/#{file_name}" }
        unless existing
          file_ref = app_group.new_file(file_name)
          if file_name.end_with?(".swift")
            app_target.source_build_phase.add_file_reference(file_ref)
          elsif file_name.end_with?(".plist")
            app_target.resources_build_phase.add_file_reference(file_ref)
          end
          puts "==> Registered #{file_name} in App target"
        end
      end

      app_target.build_configurations.each do |config|
        config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'
      end

      project.save
      puts "✔ App.xcodeproj updated successfully (SWIFT_ENABLE_EXPLICIT_MODULES = NO)"
    end
  rescue => e
    puts "Note: Xcode project registration warning: #{e.message}"
  end
' || true

echo "==> Re-applying patches before sync"
node "$ROOT/ios-native/patch-ios.cjs"

echo "==> Syncing Capacitor"
npx cap sync ios

echo "==> Ensuring Podfile post_install after sync"
node "$ROOT/ios-native/patch-ios.cjs"

echo ""
echo "Done iOS setup!"
echo "Then:  npx cap open ios"
