package com.appsonairreactnativeapppush

import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.appsonair.apppush.AppPushService
import com.appsonair.apppush.INotificationClickListener
import com.appsonair.apppush.INotificationLifecycleListener
import com.appsonair.apppush.INotificationPermissionObserver
import com.appsonair.apppush.IPushSubscriptionObserver
import com.appsonair.apppush.IUserStateObserver
import com.appsonair.apppush.LogLevel
import com.appsonair.apppush.NotificationClickEvent
import com.appsonair.apppush.NotificationWillDisplayEvent
import com.appsonair.apppush.PushDebug
import com.appsonair.apppush.PushError
import com.appsonair.apppush.PushListener
import com.appsonair.apppush.PushNotification
import com.appsonair.apppush.PushNotifications
import com.appsonair.apppush.PushSubscriptionChangedState
import com.appsonair.apppush.PushUser
import com.appsonair.apppush.UserChangedState
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The Android bridge implementation, shared by the New and Old Architecture modules.
 * The SDK handles its own threading, so nothing here dispatches except [onWillDisplay].
 */
class AppsonairReactNativeApppushModuleImpl(
  private val reactContext: ReactApplicationContext
) {

  companion object {
    const val NAME = "AppsonairReactNativeApppush"

    // Also defined in src/index.tsx and the iOS bridge; keep all three in sync.
    private const val EVENT_TOKEN_UPDATED = "AppsonairPush:onTokenUpdated"
    private const val EVENT_NOTIFICATION_RECEIVED = "AppsonairPush:onNotificationReceived"
    private const val EVENT_NOTIFICATION_OPENED = "AppsonairPush:onNotificationOpened"
    private const val EVENT_NOTIFICATION_WILL_DISPLAY = "AppsonairPush:onNotificationWillDisplay"
    private const val EVENT_PERMISSION_CHANGED = "AppsonairPush:onPermissionChanged"
    private const val EVENT_SUBSCRIPTION_CHANGED = "AppsonairPush:onSubscriptionChanged"
    private const val EVENT_USER_STATE_CHANGED = "AppsonairPush:onUserStateChanged"
    private const val EVENT_SILENT_NOTIFICATION = "AppsonairPush:onSilentNotification"
    private const val EVENT_INSTALLATION_ID_UPDATED = "AppsonairPush:onInstallationIdUpdated"
    private const val EVENT_ERROR = "AppsonairPush:onError"

    /**
     * How long [onWillDisplay] waits for JS (well inside FCM's ~10 s window).
     * On timeout the notification is shown.
     */
    private const val WILL_DISPLAY_TIMEOUT_MS = 2_000L
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  /** Guards against double-registering SDK listeners if initialize() is called twice. */
  private val listenersRegistered = AtomicBoolean(false)

  // MARK: - preventDefault plumbing
  //
  // The SDK needs preventDefault() synchronously, but JS answers asynchronously, so
  // each notification waits on a latch released by completeNotificationWillDisplay().

  private val pendingWillDisplay = ConcurrentHashMap<String, CountDownLatch>()
  private val willDisplayDecision = ConcurrentHashMap<String, Boolean>()

  // MARK: - Installation ID
  //
  // The SDK returns the id via onInstallationIdUpdated, so promises wait here.

  private val pendingInstallationIdPromises = mutableListOf<Promise>()
  private var cachedInstallationId: String? = null

  // MARK: - Events

  private fun emit(eventName: String, params: WritableMap?) {
    if (!reactContext.hasActiveReactInstance()) return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  // MARK: - Lifecycle

  fun initialize(config: ReadableMap?, promise: Promise) {
    try {
      val debug = config?.takeIf { it.hasKey("debug") }?.getBoolean("debug") ?: false

      AppPushService.initialize(reactContext.applicationContext, debug)

      registerSdkListeners()
      registerActivityHooks()

      // A tap that launched the app arrives in the launch Intent before JS runs, so
      // replay it here. handleNotificationTapIntent ignores duplicates.
      reactContext.currentActivity?.intent?.let {
        AppPushService.handleNotificationTapIntent(it)
      }

      promise.resolve(null)
    } catch (e: Throwable) {
      promise.reject("initializeFailed", e.message, e)
    }
  }

  /** Handles taps while the app is running, so MainActivity.onNewIntent() needs no code. */
  private fun registerActivityHooks() {
    reactContext.addActivityEventListener(object : ActivityEventListener {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
      ) = Unit

      override fun onNewIntent(intent: Intent) {
        AppPushService.handleNotificationTapIntent(intent)
      }
    })
  }

  private fun registerSdkListeners() {
    if (!listenersRegistered.compareAndSet(false, true)) return

    AppPushService.setListener(object : PushListener {
      override fun onTokenUpdated(token: String) {
        emit(EVENT_TOKEN_UPDATED, Arguments.createMap().apply {
          putString("token", token)
          // iOS only (APNs sandbox/production).
          putNull("environment")
        })
      }

      override fun onInstallationIdUpdated(id: String) {
        cachedInstallationId = id
        synchronized(pendingInstallationIdPromises) {
          pendingInstallationIdPromises.forEach { it.resolve(id) }
          pendingInstallationIdPromises.clear()
        }
        emit(EVENT_INSTALLATION_ID_UPDATED, Arguments.createMap().apply {
          putString("id", id)
        })
      }

      override fun onNotificationReceived(notification: PushNotification) {
        emit(EVENT_NOTIFICATION_RECEIVED, Arguments.createMap().apply {
          putMap("notification", notification.toWritableMap())
        })
      }

      // onNotificationOpened isn't overridden: the click listener below already emits each tap.

      override fun onError(error: PushError) {
        emit(EVENT_ERROR, error.toWritableMap())
      }
    })

    // Emits onNotificationOpened for body taps (actionId null) and action buttons.
    PushNotifications.addClickListener(object : INotificationClickListener {
      override fun onClick(event: NotificationClickEvent) {
        emit(EVENT_NOTIFICATION_OPENED, Arguments.createMap().apply {
          putMap("notification", event.notification.toWritableMap())
          putString("actionId", event.result.actionId)
          putString("url", event.result.url)
        })
      }
    })

    PushNotifications.addForegroundLifecycleListener(
      object : INotificationLifecycleListener {
        override fun onWillDisplay(event: NotificationWillDisplayEvent) =
          this@AppsonairReactNativeApppushModuleImpl.onWillDisplay(event)
      }
    )

    PushNotifications.addPermissionObserver(object : INotificationPermissionObserver {
      override fun onNotificationPermissionDidChange(permission: Boolean) {
        emit(EVENT_PERMISSION_CHANGED, Arguments.createMap().apply {
          putBoolean("granted", permission)
        })
      }
    })

    PushUser.pushSubscription.addObserver(object : IPushSubscriptionObserver {
      override fun onPushSubscriptionDidChange(state: PushSubscriptionChangedState) {
        emit(EVENT_SUBSCRIPTION_CHANGED, Arguments.createMap().apply {
          putMap("previous", Arguments.createMap().apply {
            putString("id", AppPushService.subscriptionId)
            putString("token", state.previous.token)
            putBoolean("optedIn", state.previous.optedIn)
          })
          putMap("current", Arguments.createMap().apply {
            putString("id", AppPushService.subscriptionId)
            putString("token", state.current.token)
            putBoolean("optedIn", state.current.optedIn)
          })
        })
      }
    })

    PushUser.addObserver(object : IUserStateObserver {
      override fun onUserStateDidChange(state: UserChangedState) {
        emit(EVENT_USER_STATE_CHANGED, Arguments.createMap().apply {
          putMap("current", Arguments.createMap().apply {
            putString("externalId", state.current.externalId)
            putString("appsOnAirId", state.current.appsOnAirId)
          })
        })
      }
    })

    // Rare on Android: fires only for payloads the SDK treats as silent.
    AppPushService.onSilentPushReceived = { data ->
      emit(EVENT_SILENT_NOTIFICATION, Arguments.createMap().apply {
        putMap("data", Arguments.createMap().apply {
          data.forEach { (k, v) -> putString(k, v) }
        })
      })
    }
  }

  private fun onWillDisplay(event: NotificationWillDisplayEvent) {
    val id = event.notification.id
    if (id == null) {
      // No id to match JS's answer against, so just show the notification.
      emit(EVENT_NOTIFICATION_WILL_DISPLAY, Arguments.createMap().apply {
        putMap("notification", event.notification.toWritableMap())
      })
      return
    }

    val latch = CountDownLatch(1)
    pendingWillDisplay[id] = latch

    emit(EVENT_NOTIFICATION_WILL_DISPLAY, Arguments.createMap().apply {
      putMap("notification", event.notification.toWritableMap())
    })

    val answered = try {
      latch.await(WILL_DISPLAY_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    } catch (e: InterruptedException) {
      Thread.currentThread().interrupt()
      false
    }

    val shouldDisplay = if (answered) willDisplayDecision[id] ?: true else true
    pendingWillDisplay.remove(id)
    willDisplayDecision.remove(id)

    if (!shouldDisplay) {
      event.preventDefault()
    }
  }

  fun completeNotificationWillDisplay(
    notificationId: String,
    display: Boolean,
    promise: Promise
  ) {
    willDisplayDecision[notificationId] = display
    pendingWillDisplay[notificationId]?.countDown()
    promise.resolve(null)
  }

  // MARK: - Identity

  fun getDeviceId(promise: Promise) = resolving(promise) { AppPushService.getDeviceId() }

  fun getSubscriptionId(promise: Promise) = resolving(promise) { AppPushService.subscriptionId }

  fun setSubscriptionId(id: String, promise: Promise) =
    resolvingUnit(promise) { AppPushService.setSubscriptionId(id) }

  fun getExternalId(promise: Promise) = resolving(promise) { PushUser.externalId }

  fun login(externalId: String, promise: Promise) =
    resolvingUnit(promise) { AppPushService.login(externalId) }

  fun logout(promise: Promise) = resolvingUnit(promise) { AppPushService.logout() }

  // MARK: - Token

  fun getToken(promise: Promise) = resolving(promise) { PushUser.pushSubscription.token }

  fun refreshToken(promise: Promise) = resolvingUnit(promise) { AppPushService.refreshFcmToken() }

  fun getInstallationId(promise: Promise) {
    cachedInstallationId?.let { promise.resolve(it); return }
    synchronized(pendingInstallationIdPromises) { pendingInstallationIdPromises.add(promise) }
    try {
      // Fires PushListener.onInstallationIdUpdated, which drains the list above.
      AppPushService.getInstallationId()
    } catch (e: Throwable) {
      synchronized(pendingInstallationIdPromises) {
        pendingInstallationIdPromises.remove(promise)
      }
      promise.reject("installationIdFetchFailed", e.message, e)
    }
  }

  /** iOS only. */
  fun getApnsEnvironment(promise: Promise) = promise.resolve(null)

  // MARK: - Permissions

  fun requestPermission(fallbackToSettings: Boolean, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      // The SDK needs an Activity; reject instead of crashing.
      promise.reject(
        "noActivity",
        "requestPermission() needs a foreground Activity. Call it after the app is visible."
      )
      return
    }

    // The SDK doesn't return the result, so resolve when the Activity resumes after the dialog closes.
    val settled = AtomicBoolean(false)
    fun settle() {
      if (settled.compareAndSet(false, true)) {
        promise.resolve(PushNotifications.permission(reactContext))
      }
    }

    val resumeListener = object : LifecycleEventListener {
      override fun onHostResume() {
        reactContext.removeLifecycleEventListener(this)
        // Wait one frame so the OS has saved the new permission state.
        mainHandler.post { settle() }
      }

      override fun onHostPause() = Unit
      override fun onHostDestroy() = Unit
    }
    reactContext.addLifecycleEventListener(resumeListener)

    try {
      PushNotifications.requestPermission(activity, fallbackToSettings)
    } catch (e: Throwable) {
      reactContext.removeLifecycleEventListener(resumeListener)
      if (settled.compareAndSet(false, true)) {
        promise.reject("permissionRequestFailed", e.message, e)
      }
    }
  }

  fun getPermission(promise: Promise) =
    resolving(promise) { PushNotifications.permission(reactContext) }

  /** Android can only report `authorized` or `denied`. */
  fun getPermissionStatus(promise: Promise) = resolving(promise) {
    if (PushNotifications.permission(reactContext)) "authorized" else "denied"
  }

  fun canRequestPermission(promise: Promise) =
    resolving(promise) { PushNotifications.canRequestPermission(reactContext) }

  /** iOS only. */
  fun registerForProvisionalAuthorization(promise: Promise) = promise.resolve(null)

  // MARK: - Notifications

  fun clearAllNotifications(promise: Promise) =
    resolvingUnit(promise) { PushNotifications.clearAllNotifications(reactContext) }

  fun removeNotification(notificationId: String, promise: Promise) =
    resolvingUnit(promise) {
      PushNotifications.removeNotification(reactContext, notificationId)
    }

  /** Android has no bulk remove, so loop. */
  fun removeNotifications(notificationIds: ReadableArray, promise: Promise) =
    resolvingUnit(promise) {
      for (i in 0 until notificationIds.size()) {
        notificationIds.getString(i)?.let {
          PushNotifications.removeNotification(reactContext, it)
        }
      }
    }

  fun removeNotificationGroup(groupKey: String, promise: Promise) =
    resolvingUnit(promise) {
      PushNotifications.removeGroupedNotifications(reactContext, groupKey)
    }

  fun createNotificationChannel(config: ReadableMap, promise: Promise) = resolvingUnit(promise) {
    val id = config.getString("id")
      ?: throw IllegalArgumentException("channel id is required")
    val name = config.getString("name")
      ?: throw IllegalArgumentException("channel name is required")

    PushNotifications.createNotificationChannel(
      reactContext,
      id,
      name,
      importanceFromString(config.getString("importance")),
      config.getString("description") ?: "",
      config.getString("sound")
    )
  }

  fun deleteNotificationChannel(channelId: String, promise: Promise) =
    resolvingUnit(promise) {
      PushNotifications.deleteNotificationChannel(reactContext, channelId)
    }

  private fun importanceFromString(value: String?): Int = when (value) {
    "none" -> NotificationManager.IMPORTANCE_NONE
    "min" -> NotificationManager.IMPORTANCE_MIN
    "low" -> NotificationManager.IMPORTANCE_LOW
    "default" -> NotificationManager.IMPORTANCE_DEFAULT
    "max" -> NotificationManager.IMPORTANCE_MAX
    // Unknown values fall back to HIGH (the SDK default) so a typo doesn't silence a channel.
    else -> NotificationManager.IMPORTANCE_HIGH
  }

  // MARK: - Badges

  fun getBadgeCount(promise: Promise) = resolving(promise) { AppPushService.getBadgeCount() }

  fun setBadgeCount(count: Int, promise: Promise) =
    resolvingUnit(promise) { AppPushService.setBadgeCount(reactContext, count) }

  /** Android has no native increment, so read, add and set the SDK's stored count. */
  fun incrementBadgeCount(delta: Int, promise: Promise) = resolving(promise) {
    val next = (AppPushService.getBadgeCount() + delta).coerceAtLeast(0)
    AppPushService.setBadgeCount(reactContext, next)
    next
  }

  fun clearBadgeCount(promise: Promise) =
    resolvingUnit(promise) { AppPushService.clearBadgeCount(reactContext) }

  /** iOS only. */
  fun setAutoClearBadgeOnForeground(enabled: Boolean, promise: Promise) = promise.resolve(null)

  /** iOS only: Firebase always fetches a token by itself. */
  fun setAutoRegisterForRemoteNotifications(enabled: Boolean, promise: Promise) =
    promise.resolve(null)

  // MARK: - User

  fun addTag(key: String, value: String, promise: Promise) =
    resolvingUnit(promise) { PushUser.addTag(key, value) }

  fun addTags(tags: ReadableMap, promise: Promise) =
    resolvingUnit(promise) { PushUser.addTags(tags.toStringMap()) }

  fun removeTag(key: String, promise: Promise) =
    resolvingUnit(promise) { PushUser.removeTag(key) }

  fun removeTags(keys: ReadableArray, promise: Promise) =
    resolvingUnit(promise) { PushUser.removeTags(keys.toStringList()) }

  fun getTags(promise: Promise) {
    // Tags come back in a callback, so resolve the promise there.
    try {
      PushUser.getTags { tags ->
        promise.resolve(Arguments.createMap().apply {
          tags.forEach { (k, v) -> putString(k, v) }
        })
      }
    } catch (e: Throwable) {
      promise.reject(e.errorCode(), e.message, e)
    }
  }

  fun addAlias(label: String, id: String, promise: Promise) =
    resolvingUnit(promise) { PushUser.addAlias(label, id) }

  fun addAliases(aliases: ReadableMap, promise: Promise) =
    resolvingUnit(promise) { PushUser.addAliases(aliases.toStringMap()) }

  fun removeAlias(label: String, promise: Promise) =
    resolvingUnit(promise) { PushUser.removeAlias(label) }

  fun removeAliases(labels: ReadableArray, promise: Promise) =
    resolvingUnit(promise) { PushUser.removeAliases(labels.toStringList()) }

  fun addEmail(address: String, promise: Promise) =
    resolvingUnit(promise) { PushUser.addEmail(address) }

  fun removeEmail(address: String, promise: Promise) =
    resolvingUnit(promise) { PushUser.removeEmail(address) }

  fun setLanguage(languageCode: String, promise: Promise) =
    resolvingUnit(promise) { PushUser.setLanguage(languageCode) }

  fun getLanguage(promise: Promise) = resolving(promise) { PushUser.language }

  fun getPushSubscription(promise: Promise) = resolving(promise) {
    Arguments.createMap().apply {
      putString("id", PushUser.pushSubscription.id)
      putString("token", PushUser.pushSubscription.token)
      putBoolean("optedIn", PushUser.pushSubscription.optedIn)
    }
  }

  fun optIn(promise: Promise) = resolvingUnit(promise) { PushUser.pushSubscription.optIn() }

  fun optOut(promise: Promise) = resolvingUnit(promise) { PushUser.pushSubscription.optOut() }

  /**
   * Opted-in state from the backend (unlike the local value in [getPushSubscription]).
   * Falls back to the local value before the device has a subscriptionId.
   */
  fun getOptedIn(promise: Promise) {
    try {
      PushUser.pushSubscription.getOptedIn { optedIn -> promise.resolve(optedIn) }
    } catch (e: Throwable) {
      promise.reject(e.errorCode(), e.message, e)
    }
  }

  // MARK: - Consent

  fun setConsentRequired(required: Boolean, promise: Promise) =
    resolvingUnit(promise) { AppPushService.consentRequired = required }

  fun getConsentRequired(promise: Promise) = resolving(promise) { AppPushService.consentRequired }

  fun setConsentGiven(given: Boolean, promise: Promise) =
    resolvingUnit(promise) { AppPushService.consentGiven = given }

  fun getConsentGiven(promise: Promise) = resolving(promise) { AppPushService.consentGiven }

  // MARK: - Test device

  fun setTestDevice(enabled: Boolean, promise: Promise) =
    resolvingUnit(promise) { AppPushService.isTestDevice = enabled }

  fun isTestDevice(promise: Promise) = resolving(promise) { AppPushService.isTestDevice }

  // MARK: - Background sync

  /** iOS only: resolves as a no-op so cross-platform code keeps working. */
  fun scheduleBackgroundSync(options: ReadableMap?, promise: Promise) {
    Log.i(NAME, "scheduleBackgroundSync() is iOS-only; ignored on Android.")
    promise.resolve(null)
  }

  fun cancelBackgroundSync(promise: Promise) = promise.resolve(null)

  // MARK: - Debug

  fun setLogLevel(level: String, promise: Promise) = resolvingUnit(promise) {
    PushDebug.setLogLevel(
      when (level) {
        "none" -> LogLevel.NONE
        "fatal" -> LogLevel.FATAL
        "error" -> LogLevel.ERROR
        "warn" -> LogLevel.WARN
        "info" -> LogLevel.INFO
        "debug" -> LogLevel.DEBUG
        "verbose" -> LogLevel.VERBOSE
        else -> throw IllegalArgumentException("Unknown log level: $level")
      }
    )
  }

  // MARK: - Promise helpers
  //
  // Turn SDK exceptions (e.g. not initialized, empty input) into rejected promises instead of crashes.

  private inline fun resolving(promise: Promise, block: () -> Any?) {
    try {
      promise.resolve(block())
    } catch (e: Throwable) {
      promise.reject(e.errorCode(), e.message, e)
    }
  }

  private inline fun resolvingUnit(promise: Promise, block: () -> Unit) {
    try {
      block()
      promise.resolve(null)
    } catch (e: Throwable) {
      promise.reject(e.errorCode(), e.message, e)
    }
  }

  private fun Throwable.errorCode(): String = when (this) {
    is IllegalStateException -> "notInitialized"
    is IllegalArgumentException -> "invalidArgument"
    else -> "unknown"
  }

  // MARK: - Conversions

  private fun ReadableMap.toStringMap(): Map<String, String> {
    val out = mutableMapOf<String, String>()
    val iterator = keySetIterator()
    while (iterator.hasNextKey()) {
      val key = iterator.nextKey()
      getString(key)?.let { out[key] = it }
    }
    return out
  }

  private fun ReadableArray.toStringList(): List<String> =
    (0 until size()).mapNotNull { getString(it) }

  /**
   * Builds the same notification shape as iOS. The Android model has fewer fields,
   * so the rest are read from the FCM data payload.
   */
  private fun PushNotification.toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString("id", id)
    putString("title", title)
    putString("body", body)

    putString("campaignId", data["campaign_id"])
    putString("templateId", data["template_id"])
    putString("sentAt", data["sent_at"])
    putString("subtitle", data["subtitle"])
    putString("launchUrl", data["url"])
    putString("imageUrl", imageUrl)
    putString("sound", sound)
    putString("channelId", data["channel_id"])

    // iOS reads collapse_id; Android's payload contract calls it collapse_key.
    putString("collapseId", data["collapse_id"] ?: data["collapse_key"])

    val badgeIncrement = data["badge_increment"]?.toIntOrNull()
    if (badgeIncrement != null) putInt("badgeIncrement", badgeIncrement) else putNull("badgeIncrement")

    // Android has at most one image; wrap it as a one-item attachments array like iOS.
    putArray("attachments", Arguments.createArray().apply {
      imageUrl?.let {
        pushMap(Arguments.createMap().apply {
          putNull("id")
          putString("url", it)
        })
      }
    })

    putArray("actionButtons", parseActionButtons(data["actions"]))

    putMap("data", Arguments.createMap().apply {
      data.forEach { (k, v) -> putString(k, v) }
    })

    // On Android the raw payload is the same flat string map as `data`.
    putMap("rawPayload", Arguments.createMap().apply {
      data.forEach { (k, v) -> putString(k, v) }
    })
  }

  private fun parseActionButtons(raw: String?) = Arguments.createArray().apply {
    if (raw.isNullOrBlank()) return@apply
    val array = runCatching { JSONArray(raw) }.getOrNull() ?: return@apply
    for (i in 0 until array.length()) {
      val obj = array.optJSONObject(i) ?: continue
      val id = obj.optString("id").takeIf { it.isNotEmpty() } ?: continue
      pushMap(Arguments.createMap().apply {
        putString("id", id)
        putString("title", obj.optString("title"))
      })
    }
  }

  /** Error codes shared with iOS. */
  private fun PushError.toWritableMap(): WritableMap = Arguments.createMap().apply {
    putString(
      "code",
      when (code) {
        PushError.Code.NOT_INITIALIZED -> "notInitialized"
        PushError.Code.PERMISSION_DENIED -> "permissionDenied"
        PushError.Code.FIREBASE_NOT_CONFIGURED -> "firebaseNotConfigured"
        PushError.Code.TOKEN_FETCH_FAILED -> "tokenRegistrationFailed"
        PushError.Code.INSTALLATION_ID_FETCH_FAILED -> "installationIdFetchFailed"
        PushError.Code.UNKNOWN -> "unknown"
      }
    )
    putString("message", message)
    // `cause` is dropped: a Throwable can't cross the bridge.
  }
}
