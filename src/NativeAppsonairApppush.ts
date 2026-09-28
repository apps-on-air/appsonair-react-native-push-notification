import { TurboModuleRegistry, type TurboModule } from 'react-native';
import type { UnsafeObject } from 'react-native/Libraries/Types/CodegenTypes';

/**
 * Codegen spec for the native module. The Old Architecture modules implement the
 * same methods by hand, so keep them in sync.
 *
 * Codegen limits: use only primitives, `Array<T>` and `UnsafeObject` (no named
 * object types, string unions or `Record`). Public types live in types.ts/index.tsx.
 */

/**
 * Objects are `UnsafeObject` on purpose: a named type becomes a C++ struct on the
 * New Architecture, and the .mm could no longer serve both architectures with one
 * method. Their shapes are typed in src/types.ts.
 */

export interface Spec extends TurboModule {
  // MARK: Lifecycle

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
  /** Android only. No-op on iOS. */
  refreshToken(): Promise<void>;
  /** Android only. `null` on iOS. */
  getInstallationId(): Promise<string | null>;
  /** iOS only. `null` on Android. */
  getApnsEnvironment(): Promise<string | null>;

  // MARK: Permissions

  requestPermission(fallbackToSettings: boolean): Promise<boolean>;
  getPermission(): Promise<boolean>;
  getPermissionStatus(): Promise<string>;
  canRequestPermission(): Promise<boolean>;
  /** iOS only. No-op on Android. */
  registerForProvisionalAuthorization(): Promise<void>;

  // MARK: Notifications

  clearAllNotifications(): Promise<void>;
  removeNotification(notificationId: string): Promise<void>;
  removeNotifications(notificationIds: Array<string>): Promise<void>;
  /** Android only. No-op on iOS. */
  removeNotificationGroup(groupKey: string): Promise<void>;
  /** Android only. No-op on iOS. */
  createNotificationChannel(config: UnsafeObject): Promise<void>;
  /** Android only. No-op on iOS. */
  deleteNotificationChannel(channelId: string): Promise<void>;

  // MARK: Badges

  getBadgeCount(): Promise<number>;
  setBadgeCount(count: number): Promise<void>;
  incrementBadgeCount(delta: number): Promise<number>;
  clearBadgeCount(): Promise<void>;
  /** iOS only. No-op on Android. */
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

  /** Answers `onNotificationWillDisplay` (called internally for `preventDefault()`). */
  completeNotificationWillDisplay(
    notificationId: string,
    display: boolean
  ): Promise<void>;

  // MARK: NativeEventEmitter plumbing

  /** Required by `NativeEventEmitter`. */
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>(
  'AppsonairReactNativeApppush'
);
