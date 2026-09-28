import Foundation
import AppsOnAir_AppPush

#if canImport(React)
import React
#endif

/**
 Swift half of the iOS bridge; the ObjC++ module forwards every call here. The
 split exists because the SDK is Swift-only and the Codegen spec is ObjC-only.

 The SDK is main-actor only and React Native calls modules off the main queue,
 so every method hops to the main actor before touching it.
 */
@objc(AppsonairReactNativeApppushImpl)
public class AppsonairReactNativeApppushImpl: NSObject {

  /// Shared by every module instance (including after a JS reload), because the
  /// SDK listeners are registered on it at app launch.
  @objc public static let shared = AppsonairReactNativeApppushImpl()

  /// Sends an event to JS. Nil until a module attaches.
  private var eventSink: ((String, [String: Any]) -> Void)?

  /// The current module. Calls from an old module after a reload are ignored.
  private weak var owner: AnyObject?
  private var jsInitialized = false
  private var jsListening = false

  /// Taps received before JS was ready (e.g. the tap that launched the app).
  /// Sent once JS has called initialize() and subscribed, like Android does.
  private var pendingOpened: [[String: Any]] = []

  private var sdkInitialized = false

  // Also defined in src/index.tsx and the Android bridge; keep all three in sync.
  private enum Event {
    static let tokenUpdated = "AppsonairPush:onTokenUpdated"
    static let notificationReceived = "AppsonairPush:onNotificationReceived"
    static let notificationOpened = "AppsonairPush:onNotificationOpened"
    static let notificationWillDisplay = "AppsonairPush:onNotificationWillDisplay"
    static let permissionChanged = "AppsonairPush:onPermissionChanged"
    static let subscriptionChanged = "AppsonairPush:onSubscriptionChanged"
    static let userStateChanged = "AppsonairPush:onUserStateChanged"
    static let silentNotification = "AppsonairPush:onSilentNotification"
    static let error = "AppsonairPush:onError"
  }

  private var listenersRegistered = false

  private func emit(_ name: String, _ body: [String: Any]) {
    eventSink?(name, body)
  }

  // MARK: - Module attachment

  /// Called by each new module instance (a fresh JS context), so JS state resets.
  @objc public func attach(_ owner: AnyObject, sink: @escaping (String, [String: Any]) -> Void) {
    DispatchQueue.main.async {
      self.owner = owner
      self.eventSink = sink
      self.jsInitialized = false
      self.jsListening = false
    }
  }

  /// Mirrors RCTEventEmitter's start/stopObserving for `owner`.
  @objc public func setListening(_ listening: Bool, owner: AnyObject) {
    DispatchQueue.main.async {
      guard self.owner === owner else { return }
      self.jsListening = listening
      self.flushPendingOpened()
    }
  }

  private func flushPendingOpened() {
    guard jsInitialized, jsListening, !pendingOpened.isEmpty else { return }
    let events = pendingOpened
    pendingOpened.removeAll()
    events.forEach { emit(Event.notificationOpened, $0) }
  }

  // MARK: - Launch

  /**
   Starts the SDK during app launch. It can't wait for JS: when a tap launches a
   killed app, iOS delivers it right after launch, and the SDK only receives it
   once initialize() has run. Otherwise the opened/clicked event is lost.
   */
  @objc public static func initializeAtLaunch() {
    MainActor.assumeIsolated {
      // BGTaskScheduler throws if handlers are registered after launch.
      AppsOnAirBackgroundSync.registerHandlers()

      // Without an app id, AppsOnAir Core exits Debug builds, so leave it to JS initialize().
      let appId = Bundle.main.object(forInfoDictionaryKey: "AppsonairAppId") as? String
      guard let appId, !appId.isEmpty else { return }
      shared.initializeSDK()
    }
  }

  @MainActor
  private func initializeSDK() {
    guard !sdkInitialized else { return }
    sdkInitialized = true

    // Always swizzle: otherwise the host AppDelegate must forward APNs callbacks.
    AppPushService.initialize(debug: false, swizzle: true)
    registerListeners()
  }

  // MARK: - Promise helpers (run SDK calls on the main actor)

  private func onMain(_ resolve: @escaping RCTPromiseResolveBlock, _ work: @escaping @MainActor () -> Any?) {
    Task { @MainActor in
      resolve(work())
    }
  }

  private func onMainVoid(_ resolve: @escaping RCTPromiseResolveBlock, _ work: @escaping @MainActor () -> Void) {
    Task { @MainActor in
      work()
      resolve(nil)
    }
  }

  // MARK: - Lifecycle

  @objc public func initialize(
    _ config: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      let debug = (config["debug"] as? NSNumber)?.boolValue ?? false

      // Normally already done at launch.
      self.initializeSDK()

      // The SDK started with debug off, so apply it now (without overriding a level already set).
      if debug && AppPushService.Debug.logLevel == .none {
        AppPushService.Debug.setLogLevel(.debug)
      }

      self.jsInitialized = true
      self.flushPendingOpened()

      resolve(nil)
    }
  }

  @MainActor
  private func registerListeners() {
    guard !listenersRegistered else { return }
    listenersRegistered = true

    AppPushService.setListener(self)
    AppPushService.Notifications.addClickListener(self)
    AppPushService.Notifications.addForegroundLifecycleListener(self)
    AppPushService.Notifications.addPermissionObserver(self)
    AppPushService.User.pushSubscription.addObserver(self)
    AppPushService.User.addObserver(self)

    // iOS only. Completion is called immediately (iOS penalises late calls), so
    // JS gets the payload but can't do background work.
    AppPushService.onSilentPushReceived = { [weak self] userInfo, completion in
      self?.emit(Event.silentNotification, ["data": Self.flatten(userInfo)])
      completion(.newData)
    }
  }

  // MARK: - Identity

  @objc public func getDeviceId(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.deviceId }
  }

  @objc public func getSubscriptionId(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.subscriptionId }
  }

  @objc public func setSubscriptionId(_ id: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.setSubscriptionId(id) }
  }

  @objc public func getExternalId(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.User.externalId }
  }

  @objc public func login(_ externalId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.login(externalId) }
  }

  @objc public func logout(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.logout() }
  }

  // MARK: - Token

  @objc public func getToken(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.User.pushSubscription.token }
  }

  /// No-op: iOS manages APNs token refresh.
  @objc public func refreshToken(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  /// Android only (Firebase).
  @objc public func getInstallationId(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  @objc public func getApnsEnvironment(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.apnsEnvironment.rawValue }
  }

  // MARK: - Permissions

  @objc public func requestPermission(
    _ fallbackToSettings: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      AppPushService.Notifications.requestPermission(fallbackToSettings: fallbackToSettings)
      // requestPermission() doesn't return the result; refreshPermission() waits for the answer.
      let granted = await AppPushService.Notifications.refreshPermission()
      resolve(granted)
    }
  }

  @objc public func getPermission(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      // The SDK caches permission; refresh first to get the current value.
      resolve(await AppPushService.Notifications.refreshPermission())
    }
  }

  @objc public func getPermissionStatus(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      _ = await AppPushService.Notifications.refreshPermission()
      let status: String
      switch AppPushService.Notifications.permissionNative {
      case .notDetermined: status = "notDetermined"
      case .denied:        status = "denied"
      case .authorized:    status = "authorized"
      case .provisional:   status = "provisional"
      case .ephemeral:     status = "ephemeral"
      }
      resolve(status)
    }
  }

  @objc public func canRequestPermission(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.Notifications.canRequestPermission }
  }

  @objc public func registerForProvisionalAuthorization(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.Notifications.registerForProvisionalAuthorization() }
  }

  // MARK: - Notifications

  @objc public func clearAllNotifications(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.Notifications.clearAllNotifications() }
  }

  @objc public func removeNotification(_ notificationId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) {
      AppPushService.Notifications.removeNotification(withIdentifier: notificationId)
    }
  }

  @objc public func removeNotifications(_ notificationIds: NSArray, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let ids = notificationIds.compactMap { $0 as? String }
    onMainVoid(resolve) {
      AppPushService.Notifications.removeNotifications(withIdentifiers: ids)
    }
  }

  /// Android only.
  @objc public func removeNotificationGroup(_ groupKey: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  /// Android only.
  @objc public func createNotificationChannel(_ config: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  @objc public func deleteNotificationChannel(_ channelId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  // MARK: - Badges

  @objc public func getBadgeCount(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.badgeCount }
  }

  @objc public func setBadgeCount(_ count: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.setBadgeCount(Int(count)) }
  }

  @objc public func incrementBadgeCount(_ delta: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.incrementBadgeCount(by: Int(delta)) }
  }

  @objc public func clearBadgeCount(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.clearBadgeCount() }
  }

  @objc public func setAutoClearBadgeOnForeground(_ enabled: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.autoClearBadgeOnForeground = enabled }
  }

  /// Runtime override of the `AppsOnAirDisableAutoRegister` Info.plist default.
  @objc public func setAutoRegisterForRemoteNotifications(_ enabled: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.autoRegisterForRemoteNotifications = enabled }
  }

  // MARK: - User

  @objc public func addTag(_ key: String, value: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.addTag(key: key, value: value) }
  }

  @objc public func addTags(_ tags: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let map = Self.stringMap(tags)
    onMainVoid(resolve) { AppPushService.User.addTags(map) }
  }

  @objc public func removeTag(_ key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.removeTag(key) }
  }

  @objc public func removeTags(_ keys: NSArray, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let list = keys.compactMap { $0 as? String }
    onMainVoid(resolve) { AppPushService.User.removeTags(list) }
  }

  @objc public func getTags(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.User.getTags() }
  }

  @objc public func addAlias(_ label: String, id: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.addAlias(label: label, id: id) }
  }

  @objc public func addAliases(_ aliases: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let map = Self.stringMap(aliases)
    onMainVoid(resolve) { AppPushService.User.addAliases(map) }
  }

  @objc public func removeAlias(_ label: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.removeAlias(label) }
  }

  @objc public func removeAliases(_ labels: NSArray, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let list = labels.compactMap { $0 as? String }
    onMainVoid(resolve) { AppPushService.User.removeAliases(list) }
  }

  @objc public func addEmail(_ address: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.addEmail(address) }
  }

  @objc public func removeEmail(_ address: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.removeEmail(address) }
  }

  @objc public func setLanguage(_ languageCode: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.setLanguage(languageCode) }
  }

  @objc public func getLanguage(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.User.language }
  }

  @objc public func getPushSubscription(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) {
      let subscription = AppPushService.User.pushSubscription
      return [
        "id": subscription.id as Any,
        "token": subscription.token as Any,
        "optedIn": subscription.optedIn
      ] as [String: Any]
    }
  }

  @objc public func optIn(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.pushSubscription.optIn() }
  }

  @objc public func optOut(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.User.pushSubscription.optOut() }
  }

  /**
   True when there's an APNs token, the user hasn't opted out and permission is
   granted. Android reads the backend value instead, so right after permission is
   revoked in Settings the platforms can briefly disagree.
   */
  @objc public func getOptedIn(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.isOptedIn }
  }

  // MARK: - Consent

  @objc public func setConsentRequired(_ required: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.consentRequired = required }
  }

  @objc public func getConsentRequired(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.consentRequired }
  }

  @objc public func setConsentGiven(_ given: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.consentGiven = given }
  }

  @objc public func getConsentGiven(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.consentGiven }
  }

  // MARK: - Test device

  @objc public func setTestDevice(_ enabled: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppPushService.isTestDevice = enabled }
  }

  @objc public func isTestDevice(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMain(resolve) { AppPushService.isTestDevice }
  }

  // MARK: - Background sync

  @objc public func scheduleBackgroundSync(_ options: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // JS passes minutes; BGTaskScheduler wants seconds.
    let minutes = (options["intervalMinutes"] as? NSNumber)?.doubleValue ?? 60
    // `requireNetwork` is ignored: iOS has no such option.
    onMainVoid(resolve) {
      AppsOnAirBackgroundSync.scheduleIfNeeded(minimumDelay: minutes * 60)
    }
  }

  @objc public func cancelBackgroundSync(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    onMainVoid(resolve) { AppsOnAirBackgroundSync.cancelPending() }
  }

  // MARK: - Debug

  @objc public func setLogLevel(_ level: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let mapped: LogLevel
    switch level {
    case "none":    mapped = .none
    case "fatal":   mapped = .fatal
    case "error":   mapped = .error
    case "warn":    mapped = .warn
    case "info":    mapped = .info
    case "debug":   mapped = .debug
    case "verbose": mapped = .verbose
    default:
      reject("invalidArgument", "Unknown log level: \(level)", nil)
      return
    }
    onMainVoid(resolve) { AppPushService.Debug.setLogLevel(mapped) }
  }

  // MARK: - Foreground display control

  /**
   No-op on iOS: the SDK decides presentation synchronously, so the notification
   is already shown by the time JS answers. `preventDefault()` works on Android only.
   */
  @objc public func completeNotificationWillDisplay(
    _ notificationId: String,
    display: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(nil)
  }

  // MARK: - Conversions

  /// Flattens the payload to `[String: String]` to match Android's `data`.
  private static func flatten(_ userInfo: [AnyHashable: Any]) -> [String: String] {
    var out: [String: String] = [:]
    for (key, value) in userInfo {
      guard let key = key as? String else { continue }
      switch value {
      case let string as String: out[key] = string
      case let number as NSNumber: out[key] = number.stringValue
      default:
        // Objects and arrays survive as JSON so no payload key is silently lost.
        if let data = try? JSONSerialization.data(withJSONObject: value),
           let json = String(data: data, encoding: .utf8) {
          out[key] = json
        }
      }
    }
    return out
  }

  private static func stringMap(_ dictionary: NSDictionary) -> [String: String] {
    var out: [String: String] = [:]
    for (key, value) in dictionary {
      guard let key = key as? String, let value = value as? String else { continue }
      out[key] = value
    }
    return out
  }

  private static func serialize(_ notification: PushNotification) -> [String: Any] {
    return [
      "id": notification.id as Any,
      "campaignId": notification.campaignId as Any,
      "templateId": notification.templateId as Any,
      "sentAt": notification.sentAt as Any,
      "title": notification.title as Any,
      "subtitle": notification.subtitle as Any,
      "body": notification.body as Any,
      "launchUrl": notification.launchUrl as Any,
      "imageUrl": notification.imageUrl as Any,
      "attachments": notification.attachments.map {
        ["id": $0.id as Any, "url": $0.url]
      },
      "actionButtons": notification.actionButtons.map {
        ["id": $0.id, "title": $0.title]
      },
      "badgeIncrement": notification.badgeIncrement as Any,
      "collapseId": notification.collapseId as Any,
      // Android only.
      "sound": NSNull(),
      "channelId": NSNull(),
      "data": flatten(notification.userInfo),
      "rawPayload": flatten(notification.userInfo)
    ]
  }
}

// MARK: - SDK listener conformances

extension AppsonairReactNativeApppushImpl: PushListener {
  public func onAPNsTokenUpdated(token: String, environment: APNsEnvironment) {
    // Android sends `environment: null`.
    emit(Event.tokenUpdated, ["token": token, "environment": environment.rawValue])
  }

  public func onNotificationReceived(notification: PushNotification) {
    emit(Event.notificationReceived, ["notification": Self.serialize(notification)])
  }

  public func onNotificationOpened(notification: PushNotification) {
    // Intentionally empty: onClick already emits this tap; emitting here too sent it twice.
  }

  public func onError(_ error: PushError) {
    // Same code as Android's TOKEN_FETCH_FAILED.
    let code: String
    switch error.code {
    case .notInitialized:         code = "notInitialized"
    case .permissionDenied:       code = "permissionDenied"
    case .apnsRegistrationFailed: code = "tokenRegistrationFailed"
    case .unknown:                code = "unknown"
    }
    emit(Event.error, ["code": code, "message": error.message])
  }
}

extension AppsonairReactNativeApppushImpl: NotificationClickListener {
  public func onClick(event: NotificationClickEvent) {
    let body: [String: Any] = [
      "notification": Self.serialize(event.notification),
      "actionId": event.result.actionId as Any,
      "url": event.result.url as Any
    ]
    // Held until JS is ready (sent immediately if it already is).
    pendingOpened.append(body)
    flushPendingOpened()
  }
}

extension AppsonairReactNativeApppushImpl: NotificationLifecycleListener {
  public func onWillDisplay(event: NotificationWillDisplayEvent) {
    // Informational only on iOS -- see completeNotificationWillDisplay().
    emit(Event.notificationWillDisplay, [
      "notification": Self.serialize(event.notification)
    ])
  }
}

extension AppsonairReactNativeApppushImpl: NotificationPermissionObserver {
  public func onNotificationPermissionDidChange(_ permission: Bool) {
    emit(Event.permissionChanged, ["granted": permission])
  }
}

extension AppsonairReactNativeApppushImpl: PushSubscriptionObserver {
  public func onPushSubscriptionDidChange(state: PushSubscriptionChangedState) {
    // The state has no id, so read it from the SDK (main actor only).
    Task { @MainActor in
      let id = AppPushService.subscriptionId
      self.emit(Event.subscriptionChanged, [
        "previous": [
          "id": id as Any,
          "token": state.previous.token as Any,
          "optedIn": state.previous.optedIn
        ],
        "current": [
          "id": id as Any,
          "token": state.current.token as Any,
          "optedIn": state.current.optedIn
        ]
      ])
    }
  }
}

extension AppsonairReactNativeApppushImpl: UserStateObserver {
  public func onUserStateDidChange(state: UserChangedState) {
    emit(Event.userStateChanged, [
      "current": [
        "externalId": state.current.externalId as Any,
        "appsOnAirId": state.current.appsOnAirId
      ]
    ])
  }
}
