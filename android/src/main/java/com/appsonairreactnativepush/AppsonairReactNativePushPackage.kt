package com.appsonairreactnativepush

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * Autolinked entry point.
 *
 * `TurboReactPackage` serves both architectures: on the New Architecture the
 * module is looked up lazily by name through [getModule], and on the Old
 * Architecture the same lookup backs the legacy module registry. That is why
 * this file lives in src/main rather than being duplicated per source set --
 * only the module class it instantiates differs, and the build picks that.
 */
class AppsonairReactNativePushPackage : TurboReactPackage() {

  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? =
    if (name == AppsonairReactNativePushModuleImpl.NAME) {
      AppsonairReactNativePushModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    val isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
    mapOf(
      AppsonairReactNativePushModuleImpl.NAME to ReactModuleInfo(
        AppsonairReactNativePushModuleImpl.NAME,
        AppsonairReactNativePushModuleImpl.NAME,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        isTurboModule
      )
    )
  }
}
