Pod::Spec.new do |s|
  s.name           = 'TabscapeNative'
  s.version        = '1.0.0'
  s.summary        = 'Native extras for the Tabscape browser'
  s.description    = 'Bottom-edge swipes for changing tabs, and ad and tracker blocking in its pages.'
  s.license        = 'GPL-3.0-or-later'
  s.author         = 'Tabscape'
  s.homepage       = 'https://github.com/heyjeay/tabscape'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/heyjeay/tabscape.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
