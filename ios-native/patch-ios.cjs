const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

console.log('==> Running iOS environment and plugin patches...');

// 1. Patch @otakit/capacitor-updater podspec name
const otakitDir = path.join(ROOT, 'node_modules', '@otakit', 'capacitor-updater');
const otakitSrcSpec = path.join(otakitDir, 'OtaKitUpdater.podspec');
const otakitDstSpec = path.join(otakitDir, 'OtakitCapacitorUpdater.podspec');

if (fs.existsSync(otakitSrcSpec)) {
  let content = fs.readFileSync(otakitSrcSpec, 'utf8');
  content = content.replace(/s\.name\s*=\s*['"]OtaKitUpdater['"]/g, "s.name = 'OtakitCapacitorUpdater'");
  fs.writeFileSync(otakitDstSpec, content, 'utf8');
  console.log('✔ Patched OtakitCapacitorUpdater.podspec');
}

// 2. Patch @capacitor/geolocation podspec and switch expression
const geolocDir = path.join(ROOT, 'node_modules', '@capacitor', 'geolocation');
const geolocPodspec = path.join(geolocDir, 'CapacitorGeolocation.podspec');
if (fs.existsSync(geolocPodspec)) {
  let content = fs.readFileSync(geolocPodspec, 'utf8');
  content = content.replace(/s\.swift_version\s*=\s*['"]5\.1['"]/g, "s.swift_version = '5.9'");
  fs.writeFileSync(geolocPodspec, content, 'utf8');
  console.log('✔ Patched CapacitorGeolocation.podspec (SWIFT_VERSION 5.9)');
}

const geolocPluginSwift = path.join(geolocDir, 'ios', 'Sources', 'GeolocationPlugin', 'GeolocationPlugin.swift');
if (fs.existsSync(geolocPluginSwift)) {
  let content = fs.readFileSync(geolocPluginSwift, 'utf8');
  if (content.includes('let status = switch')) {
    content = content.replace(
      /let status = switch locationService\?\.authorisationStatus\s*\{[\s\S]*?default:\s*Constants\.AuthorisationStatus\.Status\.prompt\s*\}/,
      `var status = Constants.AuthorisationStatus.Status.prompt\n        switch locationService?.authorisationStatus {\n        case .restricted, .denied: status = Constants.AuthorisationStatus.Status.denied\n        case .authorisedAlways, .authorisedWhenInUse: status = Constants.AuthorisationStatus.Status.granted\n        default: status = Constants.AuthorisationStatus.Status.prompt\n        }`
    );
    fs.writeFileSync(geolocPluginSwift, content, 'utf8');
    console.log('✔ Patched GeolocationPlugin.swift switch expression');
  }
}

// 3. Patch @capacitor/ios pods_helpers.rb to ensure SWIFT_VERSION 5.9 and disable explicit modules
const podsHelpers = path.join(ROOT, 'node_modules', '@capacitor', 'ios', 'scripts', 'pods_helpers.rb');
if (fs.existsSync(podsHelpers)) {
  let content = fs.readFileSync(podsHelpers, 'utf8');
  if (!content.includes("config.build_settings['SWIFT_VERSION']")) {
    content = content.replace(
      'target.build_configurations.each do |config|',
      "target.build_configurations.each do |config|\n      config.build_settings['SWIFT_VERSION'] = '5.9'\n      config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'"
    );
    fs.writeFileSync(podsHelpers, content, 'utf8');
    console.log('✔ Patched pods_helpers.rb with SWIFT_VERSION 5.9 and SWIFT_ENABLE_EXPLICIT_MODULES NO');
  }
}

// 4. Patch ios/App/Podfile if it exists
const podfile = path.join(ROOT, 'ios', 'App', 'Podfile');
if (fs.existsSync(podfile)) {
  let content = fs.readFileSync(podfile, 'utf8');

  // Inject local source pod for IONGeolocationLib to avoid incompatible binary framework
  if (!content.includes("pod 'IONGeolocationLib'")) {
    content = content.replace(
      /target\s+['"]App['"]\s+do/,
      "target 'App' do\n  pod 'IONGeolocationLib', :path => '../../ios-native/IONGeolocationLib'"
    );
    console.log('✔ Injected local source IONGeolocationLib pod into Podfile');
  }

  if (!content.includes("config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES']")) {
    content = content.replace(
      'assertDeploymentTarget(installer)',
      `assertDeploymentTarget(installer)\n  installer.pods_project.targets.each do |target|\n    target.build_configurations.each do |config|\n      config.build_settings['SWIFT_VERSION'] = '5.9'\n      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'\n      config.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'\n    end\n  end`
    );
    console.log('✔ Patched ios/App/Podfile post_install');
  }
  fs.writeFileSync(podfile, content, 'utf8');
}

console.log('==> iOS environment patches applied successfully.');
