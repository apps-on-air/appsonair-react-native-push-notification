import { TurboModuleRegistry, type TurboModule } from 'react-native';
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

/**
 * Codegen spec for the AppsOnAir Push TurboModule.
 *
 * This file is consumed by React Native Codegen and compiles to
 * `NativeAppsonairPushSpec` — a Java abstract class and an ObjC protocol that
 * the native modules implement under the New Architecture. On the Old
 * Architecture the same JS object is served by the legacy bridge module, which
 * exposes an identical method set (see android/src/oldarch and the
 * `RCT_NEW_ARCH_ENABLED` guard in ios/AppsonairReactNativePush.mm).
 *
 * Constraints this file must respect — codegen rejects or silently mistypes
 * anything else, so do not "improve" the signatures below:
 *
 *   - Parameters and returns are primitives, nullable primitives, `Array<T>`,
 *     or `UnsafeObject`. Named object types are avoided deliberately -- see the
 *     note above `Spec`.
 *   - No string-literal unions. `logLevel`, `importance` and `environment` are
 *     plain `string` here and are narrowed to their union types in `index.tsx`,
 *     which is the type-safe surface consumers actually import.
 *   - No `Record<K, V>` — use `UnsafeObject`.
 *   - Methods are `Promise`-returning or `void`; there are no sync methods, so
 *     the module never blocks the JS thread.
 */

/**
 * Object parameters are `UnsafeObject`, not named object types, and that is
 * load-bearing rather than lazy.
 *
 * Codegen compiles a named object type into a generated C++ struct, so the
 * ObjC signature becomes `JS::NativeAppsonairPush::NativePushConfig &` under the
 * New Architecture while the Old Architecture bridge still passes
 * `NSDictionary *`. The two would no longer share a selector, and
 * ios/AppsonairReactNativePush.mm could not implement both from one method body.
 * `UnsafeObject` maps to `NSDictionary *` on both, and to `ReadableMap` on both
 * on Android.
 *
 * The shapes these accept are typed for consumers in src/types.ts -- `PushConfig`,
 * `NotificationChannelConfig` and `BackgroundSyncOptions` -- which is the surface
 * anyone actually imports. Nothing here is untyped at the call site.
 */

export interface Spec extends TurboModule {
  // MARK: Lifecycle

  /**
   * Parity A1/A2: the native signatures share zero parameters — iOS takes
   * `(debug:swizzle:)`, Android takes `(context, debug)`. Each
   * bridge supplies what its platform needs; `Context` is never exposed to JS.
   */
  initialize(config: UnsafeObject): Promise<void>;

  // MARK: Identity

  getDeviceId(): Promise<string>;
  getSubscriptionId(): Promise<string | null>;
  setSubscriptionId(id: string): Promise<void>;
  getExternalId(): Promise<string | null>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;

  // MARK: Token

  /** APNs hex token on iOS, FCM token on Android. `null` before registration. */
  getToken(): Promise<string | null>;
  /** Parity D4: Android/FCM only. Resolves immediately as a no-op on iOS. */
  refreshToken(): Promise<void>;
  /** Parity B2: Android only. Resolves `null` on iOS. */
  getInstallationId(): Promise<string | null>;
  /** Parity C8: iOS only. Resolves `null` on Android. */
  getApnsEnvironment(): Promise<string | null>;

  // MARK: Permissions

  requestPermission(fallbackToSettings: boolean): Promise<boolean>;
  getPermission(): Promise<boolean>;
  getPermissionStatus(): Promise<string>;
  canRequestPermission(): Promise<boolean>;
  /** Parity E5: iOS only. Resolves as a no-op on Android. */
  registerForProvisionalAuthorization(): Promise<void>;

  // MARK: Notifications

  clearAllNotifications(): Promise<void>;
  removeNotification(notificationId: string): Promise<void>;
  removeNotifications(notificationIds: Array<string>): Promise<void>;
  /** Parity F3: Android only. Resolves as a no-op on iOS. */
  removeNotificationGroup(groupKey: string): Promise<void>;
  /** Parity F4: Android only. Resolves as a no-op on iOS. */
  createNotificationChannel(config: UnsafeObject): Promise<void>;
  /** Parity F4: Android only. Resolves as a no-op on iOS. */
  deleteNotificationChannel(channelId: string): Promise<void>;

  // MARK: Badges

  getBadgeCount(): Promise<number>;
  setBadgeCount(count: number): Promise<void>;
  incrementBadgeCount(delta: number): Promise<number>;
  clearBadgeCount(): Promise<void>;
  /** Parity G4: iOS only. Resolves as a no-op on Android. */
  setAutoClearBadgeOnForeground(enabled: boolean): Promise<void>;

  // MARK: APNs registration

  /** iOS only. Resolves as a no-op on Android, where FCM always registers. */
  setAutoRegisterForRemoteNotifications(enabled: boolean): Promise<void>;

  // MARK: User — tags, aliases, emails, language

  addTag(key: string, value: string): Promise<void>;
  addTags(tags: UnsafeObject): Promise<void>;
  removeTag(key: string): Promise<void>;
  removeTags(keys: Array<string>): Promise<void>;
  getTags(): Promise<UnsafeObject>;

  addAlias(label: string, id: string): Promise<void>;
  addAliases(aliases: UnsafeObject): Promise<void>;
  removeAlias(label: string): Promise<void>;
  removeAliases(labels: Array<string>): Promise<void>;

  addEmail(address: string): Promise<void>;
  removeEmail(address: string): Promise<void>;

  setLanguage(languageCode: string): Promise<void>;
  getLanguage(): Promise<string>;

  // MARK: Push subscription

  /** Resolves `{ id, token, optedIn }` from local state on both platforms. */
  getPushSubscription(): Promise<UnsafeObject>;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
  /**
   * The subscription's enabled state as the backend sees it. Android reads it
   * back from /subscriptions; iOS computes the same flag it would send.
   */
  getOptedIn(): Promise<boolean>;

  // MARK: Consent

  setConsentRequired(required: boolean): Promise<void>;
  getConsentRequired(): Promise<boolean>;
  setConsentGiven(given: boolean): Promise<void>;
  getConsentGiven(): Promise<boolean>;

  // MARK: Test device

  setTestDevice(enabled: boolean): Promise<void>;
  isTestDevice(): Promise<boolean>;

  // MARK: Background sync

  scheduleBackgroundSync(options: UnsafeObject): Promise<void>;
  cancelBackgroundSync(): Promise<void>;

  // MARK: Debug

  setLogLevel(level: string): Promise<void>;

  // MARK: Foreground display control

  /**
   * Answers a pending `onNotificationWillDisplay` event. The native side holds
   * the notification until this lands or the timeout elapses, which is what
   * makes `preventDefault()` work across an async bridge.
   *
   * Not called directly — `onNotificationWillDisplay` wires it up.
   */
  completeNotificationWillDisplay(
    notificationId: string,
    display: boolean
  ): Promise<void>;

  // MARK: NativeEventEmitter plumbing

  /**
   * Required by `NativeEventEmitter` on both architectures. Under the New
   * Architecture these also satisfy the TurboModule event-emitter contract.
   */
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>(
  'AppsonairReactNativePush'
);
