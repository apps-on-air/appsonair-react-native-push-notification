/** Cross-platform types. Where iOS and Android differ, both bridges convert to these shapes. */

// MARK: - Configuration

export interface PushConfig {
  /** Print SDK logs to the console. Keep `false` in production. */
  debug?: boolean;
}

/**
 * No `appGroupId` option: iOS reads it from `AppsOnAirAppGroup` in Info.plist,
 * defaulting to `group.<bundle-id>.appsonair`.
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
 * A received or tapped notification. Fields a platform doesn't support are
 * `null` (or `[]`), never `undefined`.
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
  /** Payload `image_url`. */
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

  /** The payload's custom keys as a flat string map (same on both platforms). */
  data: Record<string, string>;

  /** The complete payload. Prefer `data`; use this only for keys missing there. */
  rawPayload: Record<string, unknown>;
}

// MARK: - Events

export interface TokenUpdatedEvent {
  /** APNs hex token on iOS, FCM registration token on Android. */
  token: string;
  /** Which APNs environment the token belongs to. **iOS only** — `null` on Android. */
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

/** Fired while the app is in the foreground, before the notification is displayed. */
export interface NotificationWillDisplayEvent {
  notification: PushNotification;
  /**
   * Suppress the system notification. Call it synchronously in the handler.
   * **Android only** — on iOS the notification is already shown when JS runs.
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
 * A data-only push delivered without being displayed.
 * - **iOS:** sent with `content-available: 1`. The handler can't do background work.
 * - **Android:** needs `silent: "true"` in the data payload, otherwise it's shown.
 */
export interface SilentNotificationEvent {
  data: Record<string, string>;
}

/** Firebase Installation ID. **Android only.** */
export interface InstallationIdEvent {
  id: string;
}

/**
 * Error codes from both platforms. `tokenRegistrationFailed` covers iOS
 * `apnsRegistrationFailed` and Android `TOKEN_FETCH_FAILED`.
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

export type LogLevel =
  | 'none'
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'verbose';

/**
 * iOS reports all five states. Android reports only `authorized` or `denied`
 * (never `notDetermined`).
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

/** **Android only.** No-op on iOS. */
export interface NotificationChannelConfig {
  id: string;
  name: string;
  importance?: NotificationChannelImportance;
  description?: string;
  /** Sound file name in `res/raw`, without extension. */
  sound?: string;
}

// MARK: - Background sync

/** **iOS only** (BGTaskScheduler). No-op on Android. */
export interface BackgroundSyncOptions {
  /** Minimum delay between runs. Defaults to 60. */
  intervalMinutes?: number;
  /** Currently ignored (iOS has no such option). */
  requireNetwork?: boolean;
}

/** Returned by every `on*` subscribe helper. Call `remove()` to unsubscribe. */
export interface Subscription {
  remove: () => void;
}
