import Foundation
import AppsOnAir_AppPush

#if canImport(React)
import React
#endif

/**
 Swift half of the iOS bridge.

 The ObjC++ class in AppsonairReactNativePush.mm owns one of these and forwards
 every call to it. The split exists because the two halves can only do one job
 each: the native `AppPushService` API is Swift-only (its static members are not
 `@objc`, so ObjC cannot reach them), while the Codegen-generated
 `NativeAppsonairPushSpec` protocol is ObjC-only and cannot be adopted from Swift.

 Threading: `AppPushService` is `@MainActor`-isolated in its entirety (parity A4),
 and React Native calls native modules off the main queue. Every method here
 therefore hops via `Task { @MainActor in ... }` before touching the SDK, and
 resolves its promise from inside that hop.
 */
@objc(AppsonairReactNativePushImpl)
public class AppsonairReactNativePushImpl: NSObject {

  /// Set by the ObjC++ class to `sendEventWithName:body:`. Nil until the module
  /// has JS listeners, which is why every emit site checks it.
  @objc public var eventSink: ((String, [String: Any]) -> Void)?

  // Event names. Duplicated in src/index.tsx and the Android bridge -- a rename
  // has to land in all three at once.
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

  // MARK: - Promise helpers
  //
  // Parity I1/I2: the JS layer guards initialisation and validates arguments, so
  // these exist for the residual case where the SDK itself refuses a call. iOS
  // logs and returns rather than throwing, so there is nothing to catch -- the
  // helpers are only about getting onto the main actor before every SDK touch.

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

      // `swizzle: true` is not configurable on purpose. With it off the host app
      // must forward APNs callbacks from its own AppDelegate, which a JS-only
      // integration has no way to do -- so the wrapper always takes the automatic path.
      AppPushService.initialize(debug: debug, swizzle: true)

      self.registerListeners()

      // Parity H1: iOS needs an explicit registration step that Android has no
      // equivalent for, and BGTaskScheduler requires it before the app finishes
      // launching. Doing it here keeps scheduleBackgroundSync() symmetrical.
      AppsOnAirBackgroundSync.registerHandlers()

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

    // Parity F5: silent push is an iOS-only concept. The completion handler must
    // be called or the OS penalises the app's background budget, so it is invoked
    // immediately -- JS gets the payload but cannot extend the background window.
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

  /// Parity D4: APNs re-registration is OS-driven, so there is nothing to refresh.
  @objc public func refreshToken(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  /// Parity B2: a Firebase concept with no APNs equivalent.
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
      // requestPermission() is fire-and-forget on iOS too; refreshPermission()
      // awaits the authorization-status read, which settles once the system
      // prompt has been answered.
      let granted = await AppPushService.Notifications.refreshPermission()
      resolve(granted)
    }
  }

  @objc public func getPermission(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      // Parity E3: `Notifications.permission` is a cache refreshed on launch and
      // foreground. Refreshing first is what makes this agree with Android's live read.
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

  /// Parity F3: group keys are an Android/FCM concept.
  @objc public func removeNotificationGroup(_ groupKey: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(nil)
  }

  /// Parity F4: notification channels are an Android 8+ concept.
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
   `AppPushService.isOptedIn` is the `enabled` flag the SDK reports to
   /subscriptions: an APNs token exists, the user has not opted out, and the OS
   currently grants permission. Android answers the same question by reading the
   value back from the backend, so the two agree in steady state but diverge the
   moment permission is revoked in Settings -- documented on the JS side.
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
    // Parity H1: the cross-platform option is minutes; BGTaskScheduler wants a
    // minimum delay in seconds.
    let minutes = (options["intervalMinutes"] as? NSNumber)?.doubleValue ?? 60
    // `requireNetwork` is deliberately unread -- BGAppRefreshTask has no such constraint.
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
   Parity F7 / B4: a no-op on iOS, by necessity rather than by choice.

   `AppPushService.handleWillPresent(notification:)` returns its presentation
   options synchronously, so there is no completion handler to hold open while
   JS decides. By the time this call arrives the notification has already been
   presented. The event still fires so JS sees the notification, but
   `preventDefault()` is honoured on Android only -- see the README.
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

  /// Parity C1: iOS's nested `[AnyHashable: Any]` is flattened so `data` means the
  /// same thing as Android's `Map<String, String>`.
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
      // Parity C1: Android-only payload keys, always null here.
      "sound": NSNull(),
      "channelId": NSNull(),
      "data": flatten(notification.userInfo),
      "rawPayload": flatten(notification.userInfo)
    ]
  }
}

// MARK: - SDK listener conformances
//
// Split into extensions so each protocol's methods sit next to the event they emit.

extension AppsonairReactNativePushImpl: PushListener {
  public func onAPNsTokenUpdated(token: String, environment: APNsEnvironment) {
    // Parity B1: one event shape for both platforms. Android sends `environment: null`.
    emit(Event.tokenUpdated, ["token": token, "environment": environment.rawValue])
  }

  public func onNotificationReceived(notification: PushNotification) {
    emit(Event.notificationReceived, ["notification": Self.serialize(notification)])
  }

  public func onNotificationOpened(notification: PushNotification) {
    emit(Event.notificationOpened, [
      "notification": Self.serialize(notification),
      "actionId": NSNull(),
      "url": notification.launchUrl as Any
    ])
  }

  public func onError(_ error: PushError) {
    // Parity C5: `apnsRegistrationFailed` and Android's TOKEN_FETCH_FAILED both
    // surface as the shared `tokenRegistrationFailed`.
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

extension AppsonairReactNativePushImpl: NotificationClickListener {
  public func onClick(event: NotificationClickEvent) {
    emit(Event.notificationOpened, [
      "notification": Self.serialize(event.notification),
      "actionId": event.result.actionId as Any,
      "url": event.result.url as Any
    ])
  }
}

extension AppsonairReactNativePushImpl: NotificationLifecycleListener {
  public func onWillDisplay(event: NotificationWillDisplayEvent) {
    // Informational only on iOS -- see completeNotificationWillDisplay().
    emit(Event.notificationWillDisplay, [
      "notification": Self.serialize(event.notification)
    ])
  }
}

extension AppsonairReactNativePushImpl: NotificationPermissionObserver {
  public func onNotificationPermissionDidChange(_ permission: Bool) {
    emit(Event.permissionChanged, ["granted": permission])
  }
}

extension AppsonairReactNativePushImpl: PushSubscriptionObserver {
  public func onPushSubscriptionDidChange(state: PushSubscriptionChangedState) {
    // `PushSubscriptionChangedState` carries only `token` and `optedIn` on both
    // platforms -- the subscription id lives on the SDK singleton, which is
    // @MainActor-isolated, hence the hop. The Android bridge reads it the same way,
    // so both platforms report the same `id` on both sides of the change.
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

extension AppsonairReactNativePushImpl: UserStateObserver {
  public func onUserStateDidChange(state: UserChangedState) {
    emit(Event.userStateChanged, [
      "current": [
        "externalId": state.current.externalId as Any,
        "appsOnAirId": state.current.appsOnAirId
      ]
    ])
  }
}
