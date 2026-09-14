package com.appsonairreactnativepush

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule

/**
 * Old Architecture (Bridge) module.
 *
 * Same class name and package as the New Architecture module in src/newarch --
 * build.gradle puts exactly one of the two on the compile path, so the JS side
 * resolves the same module name either way and never learns which is in use.
 *
 * The method set is kept in lockstep with src/NativeAppsonairPush.ts by hand;
 * there is no Codegen here to check it. When adding a method, add it to the spec,
 * to this class, and to the newarch class together.
 *
 * `double` parameters match the New Architecture signatures deliberately: the
 * bridge would accept `Int`, but keeping both classes identical means the shared
 * implementation sees one calling convention.
 */
@ReactModule(name = AppsonairReactNativePushModuleImpl.NAME)
class AppsonairReactNativePushModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val impl = AppsonairReactNativePushModuleImpl(reactContext)

  override fun getName(): String = AppsonairReactNativePushModuleImpl.NAME

  // MARK: Lifecycle

  @ReactMethod
  fun initialize(config: ReadableMap?, promise: Promise) = impl.initialize(config, promise)

  // MARK: Identity

  @ReactMethod
  fun getDeviceId(promise: Promise) = impl.getDeviceId(promise)

  @ReactMethod
  fun getSubscriptionId(promise: Promise) = impl.getSubscriptionId(promise)

  @ReactMethod
  fun setSubscriptionId(id: String, promise: Promise) = impl.setSubscriptionId(id, promise)

  @ReactMethod
  fun getExternalId(promise: Promise) = impl.getExternalId(promise)

  @ReactMethod
  fun login(externalId: String, promise: Promise) = impl.login(externalId, promise)

  @ReactMethod
  fun logout(promise: Promise) = impl.logout(promise)

  // MARK: Token

  @ReactMethod
  fun getToken(promise: Promise) = impl.getToken(promise)

  @ReactMethod
  fun refreshToken(promise: Promise) = impl.refreshToken(promise)

  @ReactMethod
  fun getInstallationId(promise: Promise) = impl.getInstallationId(promise)

  @ReactMethod
  fun getApnsEnvironment(promise: Promise) = impl.getApnsEnvironment(promise)

  // MARK: Permissions

  @ReactMethod
  fun requestPermission(fallbackToSettings: Boolean, promise: Promise) =
    impl.requestPermission(fallbackToSettings, promise)

  @ReactMethod
  fun getPermission(promise: Promise) = impl.getPermission(promise)

  @ReactMethod
  fun getPermissionStatus(promise: Promise) = impl.getPermissionStatus(promise)

  @ReactMethod
  fun canRequestPermission(promise: Promise) = impl.canRequestPermission(promise)

  @ReactMethod
  fun registerForProvisionalAuthorization(promise: Promise) =
    impl.registerForProvisionalAuthorization(promise)

  // MARK: Notifications

  @ReactMethod
  fun clearAllNotifications(promise: Promise) = impl.clearAllNotifications(promise)

  @ReactMethod
  fun removeNotification(notificationId: String, promise: Promise) =
    impl.removeNotification(notificationId, promise)

  @ReactMethod
  fun removeNotifications(notificationIds: ReadableArray, promise: Promise) =
    impl.removeNotifications(notificationIds, promise)

  @ReactMethod
  fun removeNotificationGroup(groupKey: String, promise: Promise) =
    impl.removeNotificationGroup(groupKey, promise)

  @ReactMethod
  fun createNotificationChannel(config: ReadableMap, promise: Promise) =
    impl.createNotificationChannel(config, promise)

  @ReactMethod
  fun deleteNotificationChannel(channelId: String, promise: Promise) =
    impl.deleteNotificationChannel(channelId, promise)

  // MARK: Badges

  @ReactMethod
  fun getBadgeCount(promise: Promise) = impl.getBadgeCount(promise)

  @ReactMethod
  fun setBadgeCount(count: Double, promise: Promise) = impl.setBadgeCount(count.toInt(), promise)

  @ReactMethod
  fun incrementBadgeCount(delta: Double, promise: Promise) =
    impl.incrementBadgeCount(delta.toInt(), promise)

  @ReactMethod
  fun clearBadgeCount(promise: Promise) = impl.clearBadgeCount(promise)

  @ReactMethod
  fun setAutoClearBadgeOnForeground(enabled: Boolean, promise: Promise) =
    impl.setAutoClearBadgeOnForeground(enabled, promise)

  @ReactMethod
  fun setAutoRegisterForRemoteNotifications(enabled: Boolean, promise: Promise) =
    impl.setAutoRegisterForRemoteNotifications(enabled, promise)

  // MARK: User

  @ReactMethod
  fun addTag(key: String, value: String, promise: Promise) = impl.addTag(key, value, promise)

  @ReactMethod
  fun addTags(tags: ReadableMap, promise: Promise) = impl.addTags(tags, promise)

  @ReactMethod
  fun removeTag(key: String, promise: Promise) = impl.removeTag(key, promise)

  @ReactMethod
  fun removeTags(keys: ReadableArray, promise: Promise) = impl.removeTags(keys, promise)

  @ReactMethod
  fun getTags(promise: Promise) = impl.getTags(promise)

  @ReactMethod
  fun addAlias(label: String, id: String, promise: Promise) = impl.addAlias(label, id, promise)

  @ReactMethod
  fun addAliases(aliases: ReadableMap, promise: Promise) = impl.addAliases(aliases, promise)

  @ReactMethod
  fun removeAlias(label: String, promise: Promise) = impl.removeAlias(label, promise)

  @ReactMethod
  fun removeAliases(labels: ReadableArray, promise: Promise) = impl.removeAliases(labels, promise)

  @ReactMethod
  fun addEmail(address: String, promise: Promise) = impl.addEmail(address, promise)

  @ReactMethod
  fun removeEmail(address: String, promise: Promise) = impl.removeEmail(address, promise)

  @ReactMethod
  fun setLanguage(languageCode: String, promise: Promise) = impl.setLanguage(languageCode, promise)

  @ReactMethod
  fun getLanguage(promise: Promise) = impl.getLanguage(promise)

  @ReactMethod
  fun getPushSubscription(promise: Promise) = impl.getPushSubscription(promise)

  @ReactMethod
  fun optIn(promise: Promise) = impl.optIn(promise)

  @ReactMethod
  fun optOut(promise: Promise) = impl.optOut(promise)

  @ReactMethod
  fun getOptedIn(promise: Promise) = impl.getOptedIn(promise)

  // MARK: Consent

  @ReactMethod
  fun setConsentRequired(required: Boolean, promise: Promise) =
    impl.setConsentRequired(required, promise)

  @ReactMethod
  fun getConsentRequired(promise: Promise) = impl.getConsentRequired(promise)

  @ReactMethod
  fun setConsentGiven(given: Boolean, promise: Promise) = impl.setConsentGiven(given, promise)

  @ReactMethod
  fun getConsentGiven(promise: Promise) = impl.getConsentGiven(promise)

  // MARK: Test device

  @ReactMethod
  fun setTestDevice(enabled: Boolean, promise: Promise) = impl.setTestDevice(enabled, promise)

  @ReactMethod
  fun isTestDevice(promise: Promise) = impl.isTestDevice(promise)

  // MARK: Background sync

  @ReactMethod
  fun scheduleBackgroundSync(options: ReadableMap?, promise: Promise) =
    impl.scheduleBackgroundSync(options, promise)

  @ReactMethod
  fun cancelBackgroundSync(promise: Promise) = impl.cancelBackgroundSync(promise)

  // MARK: Debug

  @ReactMethod
  fun setLogLevel(level: String, promise: Promise) = impl.setLogLevel(level, promise)

  // MARK: Foreground display control

  @ReactMethod
  fun completeNotificationWillDisplay(
    notificationId: String,
    display: Boolean,
    promise: Promise
  ) = impl.completeNotificationWillDisplay(notificationId, display, promise)

  // MARK: NativeEventEmitter plumbing
  //
  // NativeEventEmitter warns on the Old Architecture if the module does not
  // declare these, even though RCTDeviceEventEmitter needs no bookkeeping.

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit
}
