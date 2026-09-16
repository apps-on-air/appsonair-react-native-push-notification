package com.appsonairreactnativeapppush

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
class AppsonairReactNativeApppushPackage : TurboReactPackage() {

  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? =
    if (name == AppsonairReactNativeApppushModuleImpl.NAME) {
      AppsonairReactNativeApppushModule(reactContext)
    } else {
      null
    }

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    val isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
    mapOf(
      AppsonairReactNativeApppushModuleImpl.NAME to ReactModuleInfo(
        AppsonairReactNativeApppushModuleImpl.NAME,
        AppsonairReactNativeApppushModuleImpl.NAME,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        isTurboModule
      )
    )
  }
}
