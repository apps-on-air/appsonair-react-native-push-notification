/**
 * Cross-platform types for the AppsOnAir Push SDK.
 *
 * Where the two native SDKs disagree, this file defines the single shape the
 * wrapper exposes and the native bridges normalise to. Every such decision
 * traces to a row in `appsonair-push-notification-android/CROSS_PLATFORM_PARITY.md`;
 * the row id is cited so the reason survives.
 */

// MARK: - Configuration

export interface PushConfig {
  /** Print SDK logs to the console. Keep `false` in production. */
  debug?: boolean;
}

/**
 * There is deliberately no `appGroupId` option.
 *
 * The parity audit's A1 row proposes one, but the native iOS initializer is
 * `initialize(debug:swizzle:)` — it takes no App Group argument. iOS resolves the
 * group itself, from an `AppsOnAirAppGroup` string in the app's Info.plist, else
 * the convention `group.<bundle-id>.appsonair`. Accepting the value here would be
 * a knob that silently does nothing, so it is configured where it is actually
 * read. See the README's iOS setup section.
 */

// MARK: - Notification payload

/** An action button attached to the notification payload. */
export interface NotificationActionButton {
  id: string;
  title: string;
}

/** A media attachment, or one entry synthesised from `imageUrl`. */
export interface NotificationAttachment {
  id: string | null;
  url: string;
}

/**
 * A received or tapped notification.
 *
 * Parity C1: iOS emits 14 fields, Android 6. This is the union — fields the
 * running platform cannot source resolve to `null` (or `[]`), never `undefined`.
 * The per-field platform notes below are the authoritative support matrix.
 */
export interface PushNotification {
  /** Payload `notification_id`. */
  id: string | null;
  /** Payload `campaign_id`. **iOS only** — `null` on Android. */
  campaignId: string | null;
  /** Payload `template_id`. **iOS only** — `null` on Android. */
  templateId: string | null;
  /** Payload `sent_at`, ISO-8601 exactly as received. **iOS only.** */
  sentAt: string | null;

  title: string | null;
  /** Second line above the body. **iOS only** — Android has no subtitle concept. */
  subtitle: string | null;
  body: string | null;

  /** Payload `url` — deep link opened on tap. */
  launchUrl: string | null;
  /** Payload `image_url`. On iOS this loses to `attachments` when both are present. */
  imageUrl: string | null;
  /** Payload `attachments`. **iOS only** — always `[]` on Android. */
  attachments: NotificationAttachment[];
  /** Payload `actions`. Supported on both platforms. */
  actionButtons: NotificationActionButton[];
  /** Payload `badge_increment`. **iOS only** — `null` on Android. */
  badgeIncrement: number | null;
  /** Payload `collapse_id` (iOS) / `collapse_key` (Android). */
  collapseId: string | null;
  /** Sound file name in `res/raw`, no extension. **Android only** — `null` on iOS. */
  sound: string | null;
  /** Notification channel id. **Android only** — `null` on iOS. */
  channelId: string | null;

  /**
   * Flattened string map of the payload's custom keys.
   *
   * Parity C1: Android's native `data` map is already `Map<String, String>`;
   * the iOS bridge flattens `userInfo` to match, so this field has the same
   * meaning on both platforms.
   */
  data: Record<string, string>;

  /**
   * The complete unmodified payload. Shapes differ per platform (APNs `userInfo`
   * vs the FCM data bundle) — reach for `data` first, and use this only for keys
   * that survive neither flattening nor the typed fields above.
   */
  rawPayload: Record<string, unknown>;
}

// MARK: - Events

export interface TokenUpdatedEvent {
  /** APNs hex token on iOS, FCM registration token on Android. */
  token: string;
  /**
   * Parity B1/C8: which APNs endpoint the backend must use.
   * **iOS only** — always `null` on Android, where FCM routes for you.
   */
  environment: 'sandbox' | 'production' | null;
}

export interface NotificationOpenedEvent {
  notification: PushNotification;
  /** `null` when the notification body was tapped; set for an action-button tap. */
  actionId: string | null;
  /** The payload's launch URL, if any. */
  url: string | null;
}

export interface NotificationReceivedEvent {
  notification: PushNotification;
}

/**
 * Fired while the app is in the foreground, before the notification is displayed.
 *
 * Parity B4/F7: `preventDefault()` is exposed, presentation options are not —
 * iOS lets the OS present, Android builds the notification itself, so any
 * option set would mean different things on each platform.
 */
export interface NotificationWillDisplayEvent {
  notification: PushNotification;
  /**
   * Suppress the system notification. Must be called synchronously in the handler.
   *
   * **Honoured on Android only.** The Android SDK calls its foreground listeners
   * on FCM's background thread, so the bridge can park there while JS decides.
   * iOS's `handleWillPresent(notification:)` returns its presentation options
   * synchronously with no completion handler to hold open, so by the time a JS
   * handler runs the notification has already been presented. On iOS this event
   * is informational and calling `preventDefault()` does nothing.
   */
  preventDefault: () => void;
}

export interface PermissionChangedEvent {
  granted: boolean;
}

export interface PushSubscriptionState {
  id: string | null;
  token: string | null;
  optedIn: boolean;
}

export interface PushSubscriptionChangedEvent {
  previous: PushSubscriptionState;
  current: PushSubscriptionState;
}

export interface UserState {
  /** The external id linked via `login()`. `null` while anonymous. */
  externalId: string | null;
  /** The AppsOnAir-assigned device id. */
  appsOnAirId: string;
}

export interface UserStateChangedEvent {
  current: UserState;
}

/**
 * A data-only push that must not be displayed.
 *
 * Parity F5: **iOS only.** Android renders every data push as a visible
 * notification and fires no listener, so this event never arrives there.
 */
export interface SilentNotificationEvent {
  data: Record<string, string>;
}

/** Firebase Installation ID. Parity B2: **Android only.** */
export interface InstallationIdEvent {
  id: string;
}

/**
 * Parity C5: the union of both platforms' error codes in one casing.
 * `tokenRegistrationFailed` is the shared name for iOS `apnsRegistrationFailed`
 * and Android `TOKEN_FETCH_FAILED`.
 *
 * Native `PushError.cause` is dropped — a `Throwable` does not cross the bridge.
 */
export type PushErrorCode =
  | 'notInitialized'
  | 'permissionDenied'
  /** **Android only.** No `google-services.json`, or the plugin was not applied. */
  | 'firebaseNotConfigured'
  | 'tokenRegistrationFailed'
  | 'installationIdFetchFailed'
  | 'unknown';

export interface PushErrorEvent {
  code: PushErrorCode;
  message: string;
}

// MARK: - Enums

/** Parity C6: one casing for both platforms; the bridge maps to the native enum. */
export type LogLevel =
  | 'none'
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'verbose';

/**
 * Parity C7: iOS reports all five states. Android has no granular type and
 * reports only `authorized` or `denied` — it can never return `notDetermined`,
 * so do not branch on that value for a cross-platform pre-prompt.
 */
export type PermissionStatus =
  | 'notDetermined'
  | 'denied'
  | 'authorized'
  | 'provisional'
  | 'ephemeral';

export interface RequestPermissionOptions {
  /**
   * When permission was already permanently denied, send the user to the OS
   * settings screen instead of failing silently. Defaults to `false`.
   */
  fallbackToSettings?: boolean;
}

// MARK: - Android notification channels

/** Mirrors `NotificationManager.IMPORTANCE_*`. */
export type NotificationChannelImportance =
  | 'none'
  | 'min'
  | 'low'
  | 'default'
  | 'high'
  | 'max';

/** Parity F4: **Android only.** A no-op on iOS, which has no channel concept. */
export interface NotificationChannelConfig {
  id: string;
  name: string;
  importance?: NotificationChannelImportance;
  description?: string;
  /** Sound file name in `res/raw`, without extension. */
  sound?: string;
}

// MARK: - Background sync

/**
 * Parity H1: the two native APIs share no method name, parameter, or unit —
 * iOS takes seconds via BGTaskScheduler, Android minutes via WorkManager. This
 * is the single shape; each bridge converts.
 */
export interface BackgroundSyncOptions {
  /** Defaults to 60. iOS converts to seconds and treats it as a *minimum* delay. */
  intervalMinutes?: number;
  /** Android WorkManager constraint. Ignored on iOS. Defaults to `true`. */
  requireNetwork?: boolean;
}

/** Returned by every `on*` subscribe helper. Call `remove()` to unsubscribe. */
export interface Subscription {
  remove: () => void;
}
