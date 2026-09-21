Pod::Spec.new do |spec|
  spec.name                   = 'IONGeolocationLib'
  spec.version                = '2.1.0'
  spec.summary                = 'A Swift library for iOS that provides simple, reliable access to device GPS capabilities.'
  spec.description            = 'Source build of IONGeolocationLib to ensure compiler and SDK compatibility.'
  spec.homepage               = 'https://github.com/ionic-team/ion-ios-geolocation'
  spec.license                = { :type => 'MIT' }
  spec.author                 = { 'Ionic' => 'hi@ionicframework.com' }
  spec.source                 = { :path => '.' }
  spec.source_files           = 'Sources/**/*.swift'
  spec.ios.deployment_target  = '14.0'
  spec.swift_version          = '5.9'
end
