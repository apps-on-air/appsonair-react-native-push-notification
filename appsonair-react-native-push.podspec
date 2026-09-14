require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))
folly_compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32'

Pod::Spec.new do |s|
  s.name         = "appsonair-react-native-push"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  # The native SDK is iOS 15+ (AppsOnAir-AppPush.podspec), so this cannot go lower
  # even where the host app's min_ios_version_supported is older.
  s.platforms    = { :ios => "15.0" }
  s.source       = { :git => "https://github.com/apps-on-air/appsonair-react-native-push-notification.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.9"

  # Pinned so the Swift-generated header is predictably named
  # AppsonairReactNativePush-Swift.h. AppsonairReactNativePush.mm imports it by
  # that name; without this, CocoaPods derives the module name from the pod name
  # and the import becomes appsonair_react_native_push-Swift.h.
  s.module_name  = "AppsonairReactNativePush"

  # The native AppsOnAir Push SDK, from the CocoaPods trunk.
  #
  # Exact-version pin, matching the AppLink/AppSync/AppRemark wrappers. Nothing
  # else is needed in a host app's Podfile -- `pod install` resolves it from trunk.
  #
  # If `pod install` cannot find the version, the spec repo is stale: run
  # `pod repo update`. To build against a local SDK checkout instead, declare it
  # in the host app's own Podfile, which takes precedence over this line:
  #
  #   pod 'AppsOnAir-AppPush', :path => '../../appsonair-ios-push-notification'
  #
  # See the README's iOS installation section.
  s.dependency 'AppsOnAir-AppPush', '0.0.2-alpha'

  # Installs the React dependencies, and on RN >= 0.71 wires up the New
  # Architecture (Codegen output, Folly, ReactCommon) when it is enabled. The
  # else-branch is the pre-0.71 fallback.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"

    if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
      s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
      s.pod_target_xcconfig = {
        "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
        "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
        "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      }
      s.dependency "React-Codegen"
      s.dependency "RCT-Folly"
      s.dependency "RCTRequired"
      s.dependency "RCTTypeSafety"
      s.dependency "ReactCommon/turbomodule/core"
    end
  end
end
