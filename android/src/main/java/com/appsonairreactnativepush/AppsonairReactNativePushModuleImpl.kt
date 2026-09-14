package com.appsonairreactnativepush

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
 * The whole Android bridge implementation.
 *
 * Both architectures share this class verbatim -- the New and Old Architecture
 * module classes in src/newarch and src/oldarch are thin subclasses that differ
 * only in what they extend. Keeping every behaviour here is what makes "supports
 * both architectures" a build-configuration detail rather than two codebases.
 *
 * Threading: the native SDK posts its callbacks to the main thread already, and
 * every method below is either a plain property read or a call the SDK itself
 * marshals, so this class does no dispatching of its own -- except for the one
 * documented latch in [onWillDisplay].
 */
class AppsonairReactNativePushModuleImpl(
  private val reactContext: ReactApplicationContext
) {

  companion object {
    const val NAME = "AppsonairReactNativePush"

    // Event names. These strings are duplicated in src/index.tsx and in the iOS
    // bridge -- a rename has to land in all three at once.
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
     * How long [onWillDisplay] blocks waiting for JS to answer.
     *
     * The SDK calls foreground lifecycle listeners on FCM's background thread,
     * whose process window is about 10 seconds, so a bounded wait well inside
     * that is safe. On timeout the notification displays -- failing open, because
     * a dropped notification is worse than an unsuppressed one.
     */
    private const val WILL_DISPLAY_TIMEOUT_MS = 2_000L
  }

  private val mainHandler = Handler(Looper.getMainLooper())

  /** Guards against double-registering SDK listeners if initialize() is called twice. */
  private val listenersRegistered = AtomicBoolean(false)

  // MARK: - preventDefault plumbing
  //
  // Parity F7: the SDK expects preventDefault() to be called synchronously inside
  // onWillDisplay, but the JS handler is an async bridge hop away. Each pending
  // notification therefore parks its native thread on a latch that JS releases
  // via completeNotificationWillDisplay().

  private val pendingWillDisplay = ConcurrentHashMap<String, CountDownLatch>()
  private val willDisplayDecision = ConcurrentHashMap<String, Boolean>()

  // MARK: - Installation ID
  //
  // The SDK's getInstallationId() returns Unit and delivers the value through
  // PushListener.onInstallationIdUpdated, so promises park here until it lands.

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

      // Parity A1/A2: Android needs a Context that JS must never see, and has no
      // appGroupId concept -- that key is read only by the iOS bridge.
      AppPushService.initialize(reactContext.applicationContext, debug)

      registerSdkListeners()
      registerActivityHooks()

      // Parity A3: a cold start delivers the tap through the launch Intent. The
      // SDK's own ActivityLifecycleCallbacks cover onActivityCreated, but the
      // React Activity is typically already created by the time JS calls
      // initialize(), so replay the current Intent here. handleNotificationTapIntent
      // is documented idempotent, so a double delivery is not possible.
      reactContext.currentActivity?.intent?.let {
        AppPushService.handleNotificationTapIntent(it)
      }

      promise.resolve(null)
    } catch (e: Throwable) {
      promise.reject("initializeFailed", e.message, e)
    }
  }

  /**
   * Parity A3: without this the host app would have to call
   * handleNotificationTapIntent() from MainActivity.onNewIntent() by hand, and a
   * warm-start tap would be silently lost if it forgot. Registering RN's own
   * ActivityEventListener absorbs that requirement into the wrapper.
   */
  private fun registerActivityHooks() {
    reactContext.addActivityEventListener(object : ActivityEventListener {
      override fun onActivityResult(
        activity: Activity?,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
      ) = Unit

      override fun onNewIntent(intent: Intent?) {
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
          // Parity B1/C8: FCM routes for you, so there is no sandbox/production
          // split to report. iOS fills this in.
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

      override fun onNotificationOpened(notification: PushNotification) {
        emit(EVENT_NOTIFICATION_OPENED, Arguments.createMap().apply {
          putMap("notification", notification.toWritableMap())
          putNull("actionId")
          putString("url", notification.data["url"])
        })
      }

      override fun onError(error: PushError) {
        emit(EVENT_ERROR, error.toWritableMap())
      }
    })

    // The click listener carries the action button id, which PushListener.onNotificationOpened
    // does not. Both fire for a tap, so this one wins for action-button taps and
    // the plain listener above covers body taps on SDK paths that skip click listeners.
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
          this@AppsonairReactNativePushModuleImpl.onWillDisplay(event)
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

    // Parity F5: Android renders every data push as a visible notification, so
    // this fires only for payloads the SDK recognises as silent. Wired anyway
    // because the hook exists and costs nothing.
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
      // Nothing to correlate the JS answer against, so do not block -- just
      // inform JS and let the notification display.
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

  /** Parity C8: an APNs concept with no FCM equivalent. */
  fun getApnsEnvironment(promise: Promise) = promise.resolve(null)

  // MARK: - Permissions

  fun requestPermission(fallbackToSettings: Boolean, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      // Parity E1: the native call would throw without an Activity. Reject with
      // something actionable instead of crashing the app.
      promise.reject(
        "noActivity",
        "requestPermission() needs a foreground Activity. Call it after the app is visible."
      )
      return
    }

    // The SDK's request is fire-and-forget: the outcome arrives either through the
    // permission observer or, if the user dismissed without changing anything, not
    // at all. Resolving on the next host resume covers both -- the permission
    // dialog always resumes the Activity when it closes.
    val settled = AtomicBoolean(false)
    fun settle() {
      if (settled.compareAndSet(false, true)) {
        promise.resolve(PushNotifications.permission(reactContext))
      }
    }

    val resumeListener = object : LifecycleEventListener {
      override fun onHostResume() {
        reactContext.removeLifecycleEventListener(this)
        // One frame of slack so the OS has written the new grant state before it
        // is read back.
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

  /**
   * Parity C7: Android has no granular permission type, so only two of the five
   * cross-platform values are reachable here.
   */
  fun getPermissionStatus(promise: Promise) = resolving(promise) {
    if (PushNotifications.permission(reactContext)) "authorized" else "denied"
  }

  fun canRequestPermission(promise: Promise) =
    resolving(promise) { PushNotifications.canRequestPermission(reactContext) }

  /** Parity E5: iOS provisional authorization has no Android equivalent. */
  fun registerForProvisionalAuthorization(promise: Promise) = promise.resolve(null)

  // MARK: - Notifications

  fun clearAllNotifications(promise: Promise) =
    resolvingUnit(promise) { PushNotifications.clearAllNotifications(reactContext) }

  fun removeNotification(notificationId: String, promise: Promise) =
    resolvingUnit(promise) {
      PushNotifications.removeNotification(reactContext, notificationId)
    }

  /** Parity F3: iOS removes a list natively; Android has no bulk call, so loop. */
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
    // The native default is IMPORTANCE_HIGH; keep that for "high" and for anything
    // unrecognised so a typo does not silence a channel.
    else -> NotificationManager.IMPORTANCE_HIGH
  }

  // MARK: - Badges

  fun getBadgeCount(promise: Promise) = resolving(promise) { AppPushService.getBadgeCount() }

  fun setBadgeCount(count: Int, promise: Promise) =
    resolvingUnit(promise) { AppPushService.setBadgeCount(reactContext, count) }

  /**
   * Parity G2: Android has no native increment, so read -> add -> set. The read
   * is the SDK's own persisted value, which is the same value set() writes, so
   * the arithmetic is consistent even where the launcher ignores the broadcast.
   */
  fun incrementBadgeCount(delta: Int, promise: Promise) = resolving(promise) {
    val next = (AppPushService.getBadgeCount() + delta).coerceAtLeast(0)
    AppPushService.setBadgeCount(reactContext, next)
    next
  }

  fun clearBadgeCount(promise: Promise) =
    resolvingUnit(promise) { AppPushService.clearBadgeCount(reactContext) }

  /** Parity G4: an iOS-only behaviour. */
  fun setAutoClearBadgeOnForeground(enabled: Boolean, promise: Promise) = promise.resolve(null)

  /**
   * iOS-only. APNs registration can be deferred; FCM registration cannot -- the
   * Firebase SDK obtains a token on its own schedule regardless.
   */
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
    // Not resolving(): getTags() fetches from the backend, so the tags arrive in a callback
    // rather than as a return value and the promise has to be resolved from inside it.
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
   * Backend-truth opted-in state, unlike the local `optedIn` in [getPushSubscription].
   * Callback-based for the same reason as [getTags], and short-circuits to the local
   * value when the device has no subscriptionId yet.
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

  /**
   * Parity H1: the Android Push SDK has no AppsOnAirBackgroundSync -- the type
   * exists on iOS only. Resolving as a no-op keeps cross-platform calling code
   * working; it is documented as iOS-only in the README rather than faked here.
   */
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
  // Parity I1/I2: the SDK throws IllegalStateException before initialize() and
  // IllegalArgumentException on empty input. Every native call goes through one
  // of these so such a throw becomes a rejected promise instead of a crash. The
  // JS layer guards too; this is the backstop for a race the JS guard cannot see.

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
   * Parity C1: the cross-platform notification shape.
   *
   * The native Android model carries 6 fields against iOS's 14. The parity audit's
   * recommendation is that Android parse the remaining keys out of the FCM data
   * payload, which is what the block below does -- so a notification looks the
   * same to JS on both platforms, with nulls only where the payload genuinely
   * lacked the key.
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

    // Parity C1: iOS emits attachments; Android's payload has at most an image,
    // so synthesize the single-entry array iOS would have produced.
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

    // Android's raw payload is the same flat string map, unlike the nested APNs
    // userInfo on iOS. Both are the untouched payload, which is what the field promises.
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

  /** Parity C5: one casing and one membership set across both platforms. */
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
    // `cause` is deliberately dropped -- a Throwable does not cross the bridge.
  }
}
