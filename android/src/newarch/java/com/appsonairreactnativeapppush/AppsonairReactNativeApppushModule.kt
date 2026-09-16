package com.appsonairreactnativeapppush

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.module.annotations.ReactModule

/**
 * New Architecture module.
 *
 * Extends the Codegen-generated `NativeAppsonairApppushSpec`, so the method set here
 * is checked against src/NativeAppsonairApppush.ts at compile time -- adding a method
 * to the spec without implementing it will fail the build.
 *
 * Every method delegates to [AppsonairReactNativeApppushModuleImpl], which is shared
 * verbatim with the Old Architecture module in src/oldarch. Nothing but the base
 * class and the parameter types differ between the two.
 *
 * Note the `double` parameters: Codegen maps the TypeScript `number` type to
 * `double`, never `int`, so the conversion to `Int` happens here rather than in
 * the shared implementation.
 */
@ReactModule(name = AppsonairReactNativeApppushModuleImpl.NAME)
class AppsonairReactNativeApppushModule(reactContext: ReactApplicationContext) :
  NativeAppsonairApppushSpec(reactContext) {

  private val impl = AppsonairReactNativeApppushModuleImpl(reactContext)

  override fun getName(): String = AppsonairReactNativeApppushModuleImpl.NAME

  // MARK: Lifecycle

  override fun initialize(config: ReadableMap?, promise: Promise) = impl.initialize(config, promise)

  // MARK: Identity

  override fun getDeviceId(promise: Promise) = impl.getDeviceId(promise)

  override fun getSubscriptionId(promise: Promise) = impl.getSubscriptionId(promise)

  override fun setSubscriptionId(id: String, promise: Promise) =
    impl.setSubscriptionId(id, promise)

  override fun getExternalId(promise: Promise) = impl.getExternalId(promise)

  override fun login(externalId: String, promise: Promise) = impl.login(externalId, promise)

  override fun logout(promise: Promise) = impl.logout(promise)

  // MARK: Token

  override fun getToken(promise: Promise) = impl.getToken(promise)

  override fun refreshToken(promise: Promise) = impl.refreshToken(promise)

  override fun getInstallationId(promise: Promise) = impl.getInstallationId(promise)

  override fun getApnsEnvironment(promise: Promise) = impl.getApnsEnvironment(promise)

  // MARK: Permissions

  override fun requestPermission(fallbackToSettings: Boolean, promise: Promise) =
    impl.requestPermission(fallbackToSettings, promise)

  override fun getPermission(promise: Promise) = impl.getPermission(promise)

  override fun getPermissionStatus(promise: Promise) = impl.getPermissionStatus(promise)

  override fun canRequestPermission(promise: Promise) = impl.canRequestPermission(promise)

  override fun registerForProvisionalAuthorization(promise: Promise) =
    impl.registerForProvisionalAuthorization(promise)

  // MARK: Notifications

  override fun clearAllNotifications(promise: Promise) = impl.clearAllNotifications(promise)

  override fun removeNotification(notificationId: String, promise: Promise) =
    impl.removeNotification(notificationId, promise)

  override fun removeNotifications(notificationIds: ReadableArray, promise: Promise) =
    impl.removeNotifications(notificationIds, promise)

  override fun removeNotificationGroup(groupKey: String, promise: Promise) =
    impl.removeNotificationGroup(groupKey, promise)

  override fun createNotificationChannel(config: ReadableMap, promise: Promise) =
    impl.createNotificationChannel(config, promise)

  override fun deleteNotificationChannel(channelId: String, promise: Promise) =
    impl.deleteNotificationChannel(channelId, promise)

  // MARK: Badges

  override fun getBadgeCount(promise: Promise) = impl.getBadgeCount(promise)

  override fun setBadgeCount(count: Double, promise: Promise) =
    impl.setBadgeCount(count.toInt(), promise)

  override fun incrementBadgeCount(delta: Double, promise: Promise) =
    impl.incrementBadgeCount(delta.toInt(), promise)

  override fun clearBadgeCount(promise: Promise) = impl.clearBadgeCount(promise)

  override fun setAutoClearBadgeOnForeground(enabled: Boolean, promise: Promise) =
    impl.setAutoClearBadgeOnForeground(enabled, promise)

  override fun setAutoRegisterForRemoteNotifications(enabled: Boolean, promise: Promise) =
    impl.setAutoRegisterForRemoteNotifications(enabled, promise)

  // MARK: User

  override fun addTag(key: String, value: String, promise: Promise) =
    impl.addTag(key, value, promise)

  override fun addTags(tags: ReadableMap, promise: Promise) = impl.addTags(tags, promise)

  override fun removeTag(key: String, promise: Promise) = impl.removeTag(key, promise)

  override fun removeTags(keys: ReadableArray, promise: Promise) = impl.removeTags(keys, promise)

  override fun getTags(promise: Promise) = impl.getTags(promise)

  override fun addAlias(label: String, id: String, promise: Promise) =
    impl.addAlias(label, id, promise)

  override fun addAliases(aliases: ReadableMap, promise: Promise) =
    impl.addAliases(aliases, promise)

  override fun removeAlias(label: String, promise: Promise) = impl.removeAlias(label, promise)

  override fun removeAliases(labels: ReadableArray, promise: Promise) =
    impl.removeAliases(labels, promise)

  override fun addEmail(address: String, promise: Promise) = impl.addEmail(address, promise)

  override fun removeEmail(address: String, promise: Promise) = impl.removeEmail(address, promise)

  override fun setLanguage(languageCode: String, promise: Promise) =
    impl.setLanguage(languageCode, promise)

  override fun getLanguage(promise: Promise) = impl.getLanguage(promise)

  override fun getPushSubscription(promise: Promise) = impl.getPushSubscription(promise)

  override fun optIn(promise: Promise) = impl.optIn(promise)

  override fun optOut(promise: Promise) = impl.optOut(promise)

  override fun getOptedIn(promise: Promise) = impl.getOptedIn(promise)

  // MARK: Consent

  override fun setConsentRequired(required: Boolean, promise: Promise) =
    impl.setConsentRequired(required, promise)

  override fun getConsentRequired(promise: Promise) = impl.getConsentRequired(promise)

  override fun setConsentGiven(given: Boolean, promise: Promise) =
    impl.setConsentGiven(given, promise)

  override fun getConsentGiven(promise: Promise) = impl.getConsentGiven(promise)

  // MARK: Test device

  override fun setTestDevice(enabled: Boolean, promise: Promise) =
    impl.setTestDevice(enabled, promise)

  override fun isTestDevice(promise: Promise) = impl.isTestDevice(promise)

  // MARK: Background sync

  override fun scheduleBackgroundSync(options: ReadableMap?, promise: Promise) =
    impl.scheduleBackgroundSync(options, promise)

  override fun cancelBackgroundSync(promise: Promise) = impl.cancelBackgroundSync(promise)

  // MARK: Debug

  override fun setLogLevel(level: String, promise: Promise) = impl.setLogLevel(level, promise)

  // MARK: Foreground display control

  override fun completeNotificationWillDisplay(
    notificationId: String,
    display: Boolean,
    promise: Promise
  ) = impl.completeNotificationWillDisplay(notificationId, display, promise)

  // MARK: NativeEventEmitter plumbing
  //
  // Required by the spec. RCTDeviceEventEmitter delivers the events, so there is
  // no per-listener bookkeeping to do here.

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit
}
