import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  TurboModuleRegistry,
  type EmitterSubscription,
} from 'react-native';

import type { Spec } from './NativeAppsonairPush';
import type {
  LogLevel,
  NotificationOpenedEvent,
  NotificationReceivedEvent,
  NotificationWillDisplayEvent,
  PermissionChangedEvent,
  PermissionStatus,
  PushConfig,
  PushNotification,
  PushSubscriptionChangedEvent,
  PushSubscriptionState,
  RequestPermissionOptions,
  Subscription,
  UserStateChangedEvent,
} from './types';

export * from './types';

const LINKING_ERROR =
  `The package 'appsonair-react-native-push' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

/**
 * Resolves the native module on both architectures.
 *
 * `TurboModuleRegistry.get` returns the TurboModule when the New Architecture is
 * on and falls back to the legacy `NativeModules` entry when it is off, so one
 * lookup covers both. The `NativeModules` read is the belt-and-braces path for
 * hosts where the registry is unavailable; the Proxy then turns a missing module
 * into an actionable message instead of `undefined is not an object`.
 */
const NativePush: Spec =
  TurboModuleRegistry.get<Spec>('AppsonairReactNativePush') ??
  (NativeModules.AppsonairReactNativePush as Spec | undefined) ??
  (new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    }
  ) as Spec);

const emitter = new NativeEventEmitter(
  // The legacy bridge needs the module instance to route `addListener`;
  // the New Architecture ignores this argument entirely.
  NativeModules.AppsonairReactNativePush ?? undefined
);

// MARK: - Event names
// Kept in one place because the native bridges hardcode these same strings — a
// rename has to happen in four files at once: here,
// AppsonairReactNativePushModuleImpl.kt, AppsonairReactNativePushImpl.swift and
// the supportedEvents list in AppsonairReactNativePush.mm.

const EVENT = {
  notificationReceived: 'AppsonairPush:onNotificationReceived',
  notificationOpened: 'AppsonairPush:onNotificationOpened',
  notificationWillDisplay: 'AppsonairPush:onNotificationWillDisplay',
  permissionChanged: 'AppsonairPush:onPermissionChanged',
  subscriptionChanged: 'AppsonairPush:onSubscriptionChanged',
  userStateChanged: 'AppsonairPush:onUserStateChanged',

  // Still emitted by both native bridges, but deliberately not surfaced in JS:
  //   AppsonairPush:onTokenUpdated
  //   AppsonairPush:onSilentNotification
  //   AppsonairPush:onInstallationIdUpdated
  //   AppsonairPush:onError
  // Nothing subscribes to them, so RN drops them. Re-adding a subscriber is a
  // JS-only change -- the native side and the event names are unchanged.
} as const;

// MARK: - Initialization guard
//
// Parity I1: calling before `initialize()` emits a catchable error on iOS but
// throws `IllegalStateException` on Android — a hard crash. The wrapper tracks
// initialisation itself so the same misuse produces the same rejected promise
// on both platforms and the Android `check()` never reaches the app.

let initialized = false;

class PushNotInitializedError extends Error {
  readonly code = 'notInitialized';
  constructor(method: string) {
    super(
      `AppPushService.${method}() was called before initialize(). ` +
        'Await initialize() once at app start before using the SDK.'
    );
    this.name = 'PushNotInitializedError';
  }
}

class PushArgumentError extends Error {
  readonly code = 'invalidArgument';
  constructor(message: string) {
    super(message);
    this.name = 'PushArgumentError';
  }
}

function guard<T>(method: string, call: () => Promise<T>): Promise<T> {
  if (!initialized) {
    return Promise.reject(new PushNotInitializedError(method));
  }
  return call();
}

/**
 * Parity I2: `login("")` logs and returns on iOS but throws
 * `IllegalArgumentException` on Android. Validated here so neither happens.
 */
function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PushArgumentError(`${label} must be a non-empty string.`);
  }
}

// MARK: - Lifecycle

/**
 * Starts the SDK. Await this once, before any other call.
 *
 * On Android the wrapper supplies the `Context` itself; on iOS it resolves the
 * App Group and enables AppDelegate swizzling. Neither detail is exposed here.
 */
export async function initialize(config: PushConfig = {}): Promise<void> {
  await NativePush.initialize({ debug: config.debug ?? false });
  initialized = true;
}

/** Whether {@link initialize} has completed in this JS context. */
export function isInitialized(): boolean {
  return initialized;
}

// MARK: - Identity

/** The AppsOnAir-assigned device id. */
export function getDeviceId(): Promise<string> {
  return guard('getDeviceId', () => NativePush.getDeviceId());
}

/** The backend-assigned subscription id. `null` until the device registers. */
export function getSubscriptionId(): Promise<string | null> {
  return guard('getSubscriptionId', () => NativePush.getSubscriptionId());
}

/** The external id linked via {@link login}. `null` while anonymous. */
export function getExternalId(): Promise<string | null> {
  return guard('getExternalId', () => NativePush.getExternalId());
}

/** Associates this device with your own user id. */
export function login(externalId: string): Promise<void> {
  requireNonEmpty(externalId, 'externalId');
  return guard('login', () => NativePush.login(externalId));
}

/** Unlinks the external id, returning the device to an anonymous subscription. */
export function logout(): Promise<void> {
  return guard('logout', () => NativePush.logout());
}

/** Alias of {@link login}, for teams that prefer the noun. */
export const setUserId = login;

// MARK: - Token

/** APNs hex token on iOS, FCM token on Android. `null` before registration. */
export function getToken(): Promise<string | null> {
  return guard('getToken', () => NativePush.getToken());
}

/** Alias of {@link getToken}. */
export const getDeviceToken = getToken;

// MARK: - Permissions

/**
 * Prompts for notification permission and resolves the resulting grant state.
 *
 * Parity E1: Android needs a live Activity. The bridge resolves the current one
 * and rejects if none is attached rather than crashing.
 */
export function requestPermission(
  options: RequestPermissionOptions = {}
): Promise<boolean> {
  return guard('requestPermission', () =>
    NativePush.requestPermission(options.fallbackToSettings ?? false)
  );
}

/**
 * Whether notifications are currently permitted.
 *
 * Parity E3/E4/E6: iOS reads a cache and Android reads live, so the iOS bridge
 * refreshes first. The two native shapes (`async` vs sync, `permission` vs
 * `isPermissionGranted`) are collapsed into this one promise.
 */
export function getPermission(): Promise<boolean> {
  return guard('getPermission', () => NativePush.getPermission());
}

/**
 * The granular permission state.
 *
 * Parity C7: iOS reports all five values. **Android reports only `authorized`
 * or `denied`** — it never returns `notDetermined`, so do not gate a
 * cross-platform pre-prompt on that value.
 */
export function getPermissionStatus(): Promise<PermissionStatus> {
  return guard('getPermissionStatus', () =>
    NativePush.getPermissionStatus()
  ) as Promise<PermissionStatus>;
}

/**
 * Whether a permission prompt can still be shown.
 *
 * Parity E2 — **known divergence, not yet fixed in the native SDKs.** iOS
 * returns `true` only before the user has ever been asked. Android returns
 * `true` whenever permission is not granted, *including after a permanent
 * denial*. Treat a `true` on Android as "not granted", not as "never asked".
 */
export function canRequestPermission(): Promise<boolean> {
  return guard('canRequestPermission', () => NativePush.canRequestPermission());
}

/** Quiet iOS 12+ provisional authorization. **iOS only** — a no-op on Android. */
export function registerForProvisionalAuthorization(): Promise<void> {
  return guard('registerForProvisionalAuthorization', () =>
    NativePush.registerForProvisionalAuthorization()
  );
}

// MARK: - Notifications namespace

export const notifications = {
  /** Dismisses every notification this app has posted. */
  clearAll(): Promise<void> {
    return guard('notifications.clearAll', () =>
      NativePush.clearAllNotifications()
    );
  },

  /**
   * Dismisses one notification by its payload `notification_id`.
   *
   * Parity F2: on Android the id is hashed to find the posted notification, so
   * two ids that hash alike could collide. iOS matches the request identifier
   * exactly.
   */
  remove(notificationId: string): Promise<void> {
    requireNonEmpty(notificationId, 'notificationId');
    return guard('notifications.remove', () =>
      NativePush.removeNotification(notificationId)
    );
  },

  /** Dismisses several notifications. Android loops; iOS removes them in one call. */
  removeMany(notificationIds: string[]): Promise<void> {
    if (!Array.isArray(notificationIds)) {
      throw new PushArgumentError(
        'notificationIds must be an array of strings.'
      );
    }
    return guard('notifications.removeMany', () =>
      NativePush.removeNotifications(notificationIds)
    );
  },

  /** Dismisses a notification group. **Android only** — a no-op on iOS. */
  removeGroup(groupKey: string): Promise<void> {
    requireNonEmpty(groupKey, 'groupKey');
    return guard('notifications.removeGroup', () =>
      NativePush.removeNotificationGroup(groupKey)
    );
  },
};

// MARK: - Badges

export const badge = {
  /**
   * The SDK's badge count.
   *
   * Parity G1/G3: iOS reads the OS badge. Android has no OS read API, so this
   * returns the SDK's own persisted value, which can drift from what the
   * launcher actually shows.
   */
  get(): Promise<number> {
    return guard('badge.get', () => NativePush.getBadgeCount());
  },

  /**
   * Sets the badge count.
   *
   * Parity G3: reliable on iOS. On Android this is a best-effort launcher
   * broadcast that silently does nothing outside Samsung / MIUI / ASUS — which
   * is why nothing here reports success.
   */
  set(count: number): Promise<void> {
    if (!Number.isFinite(count) || count < 0) {
      throw new PushArgumentError('badge count must be a non-negative number.');
    }
    return guard('badge.set', () => NativePush.setBadgeCount(count));
  },

  /** Adds `delta` to the badge and resolves the new value, clamped at 0. */
  increment(delta = 1): Promise<number> {
    if (!Number.isFinite(delta)) {
      throw new PushArgumentError('badge delta must be a number.');
    }
    return guard('badge.increment', () =>
      NativePush.incrementBadgeCount(delta)
    );
  },

  /** Clears the badge. */
  clear(): Promise<void> {
    return guard('badge.clear', () => NativePush.clearBadgeCount());
  },

  /** Clears the badge whenever the app foregrounds. **iOS only.** */
  setAutoClearOnForeground(enabled: boolean): Promise<void> {
    return guard('badge.setAutoClearOnForeground', () =>
      NativePush.setAutoClearBadgeOnForeground(enabled)
    );
  },
};

// MARK: - User namespace

export const user = {
  /** The AppsOnAir device id. */
  getAppsOnAirId(): Promise<string> {
    return guard('user.getAppsOnAirId', () => NativePush.getDeviceId());
  },

  getExternalId,

  addTag(key: string, value: string): Promise<void> {
    requireNonEmpty(key, 'tag key');
    return guard('user.addTag', () => NativePush.addTag(key, value));
  },

  addTags(tags: Record<string, string>): Promise<void> {
    return guard('user.addTags', () => NativePush.addTags(tags));
  },

  removeTag(key: string): Promise<void> {
    requireNonEmpty(key, 'tag key');
    return guard('user.removeTag', () => NativePush.removeTag(key));
  },

  removeTags(keys: string[]): Promise<void> {
    return guard('user.removeTags', () => NativePush.removeTags(keys));
  },

  /**
   * The user's tags.
   *
   * **Android round-trips to the backend** once the device has a
   * `subscriptionId`, replacing its local cache with the result; before
   * registration it resolves the local cache without a network call. **iOS reads
   * its local cache only.** So a tag set on another device shows up on Android
   * and not on iOS, and the Android call can reject on a network failure where
   * iOS cannot.
   */
  getTags(): Promise<Record<string, string>> {
    return guard('user.getTags', () => NativePush.getTags()) as Promise<
      Record<string, string>
    >;
  },

  addAlias(label: string, id: string): Promise<void> {
    requireNonEmpty(label, 'alias label');
    requireNonEmpty(id, 'alias id');
    return guard('user.addAlias', () => NativePush.addAlias(label, id));
  },

  addAliases(aliases: Record<string, string>): Promise<void> {
    return guard('user.addAliases', () => NativePush.addAliases(aliases));
  },

  removeAlias(label: string): Promise<void> {
    requireNonEmpty(label, 'alias label');
    return guard('user.removeAlias', () => NativePush.removeAlias(label));
  },

  removeAliases(labels: string[]): Promise<void> {
    return guard('user.removeAliases', () => NativePush.removeAliases(labels));
  },

  /**
   * Adds an email identifier.
   *
   * Parity A5 — **known Android bug.** Android persists emails but never reads
   * them back on restart, so an email added here silently vanishes when the app
   * relaunches. The wrapper cannot work around it; it needs an SDK fix.
   */
  addEmail(address: string): Promise<void> {
    requireNonEmpty(address, 'email address');
    return guard('user.addEmail', () => NativePush.addEmail(address));
  },

  removeEmail(address: string): Promise<void> {
    requireNonEmpty(address, 'email address');
    return guard('user.removeEmail', () => NativePush.removeEmail(address));
  },

  setLanguage(languageCode: string): Promise<void> {
    requireNonEmpty(languageCode, 'languageCode');
    return guard('user.setLanguage', () =>
      NativePush.setLanguage(languageCode)
    );
  },

  /**
   * The device language.
   *
   * Parity 1.5 — Android reads this live; iOS snapshots it once at init and
   * never refreshes, so a mid-session language change is stale on iOS.
   */
  getLanguage(): Promise<string> {
    return guard('user.getLanguage', () => NativePush.getLanguage());
  },

  /** The current push subscription: `{ id, token, optedIn }`. */
  getPushSubscription(): Promise<PushSubscriptionState> {
    return guard('user.getPushSubscription', () =>
      NativePush.getPushSubscription()
    ) as Promise<PushSubscriptionState>;
  },

  /** Opts this device back in to push delivery. */
  optIn(): Promise<void> {
    return guard('user.optIn', () => NativePush.optIn());
  },

  /** Opts this device out of push delivery without unregistering the token. */
  optOut(): Promise<void> {
    return guard('user.optOut', () => NativePush.optOut());
  },

  /**
   * The subscription's enabled state as the backend sees it.
   *
   * Distinct from `getPushSubscription().optedIn`, which is the purely local
   * `!optedOut` flag on both platforms. The two derive it differently and
   * converge only in steady state:
   *
   * - **Android** reads it back from `/subscriptions`, so it reflects what the
   *   server actually stored. Before the device registers it falls back to the
   *   local value without a network call.
   * - **iOS** computes the same flag it would send: an APNs token exists, the
   *   user has not opted out, *and* the OS currently grants permission. So
   *   revoking permission in Settings flips this to `false` on iOS while
   *   Android keeps reporting the server's stored value.
   */
  getOptedIn(): Promise<boolean> {
    return guard('user.getOptedIn', () => NativePush.getOptedIn());
  },
};

// MARK: - Consent
//
// Parity I5: both SDKs store these flags but neither enforces them. They are
// exposed because they round-trip, but they are not a compliance control yet —
// setting `consentGiven` to false does not currently gate anything.

export const consent = {
  setRequired(required: boolean): Promise<void> {
    return guard('consent.setRequired', () =>
      NativePush.setConsentRequired(required)
    );
  },
  getRequired(): Promise<boolean> {
    return guard('consent.getRequired', () => NativePush.getConsentRequired());
  },
  setGiven(given: boolean): Promise<void> {
    return guard('consent.setGiven', () => NativePush.setConsentGiven(given));
  },
  getGiven(): Promise<boolean> {
    return guard('consent.getGiven', () => NativePush.getConsentGiven());
  },
};

// MARK: - Debug

export const debug = {
  /** Sets SDK log verbosity. Safe to call before {@link initialize}. */
  setLogLevel(level: LogLevel): Promise<void> {
    return NativePush.setLogLevel(level);
  },
};

// MARK: - Events

function subscribe<T>(
  eventName: string,
  callback: (event: T) => void
): Subscription {
  const sub: EmitterSubscription = emitter.addListener(eventName, callback);
  return { remove: () => sub.remove() };
}

/** Fires when a notification arrives while the app is in the foreground. */
export function onNotificationReceived(
  callback: (event: NotificationReceivedEvent) => void
): Subscription {
  return subscribe(EVENT.notificationReceived, callback);
}

/** Fires when the user taps a notification or one of its action buttons. */
export function onNotificationOpened(
  callback: (event: NotificationOpenedEvent) => void
): Subscription {
  return subscribe(EVENT.notificationOpened, callback);
}

/**
 * Fires in the foreground *before* the notification is displayed, giving you a
 * chance to suppress it.
 *
 * `preventDefault()` must be called synchronously inside the handler — the
 * native side is holding the notification until this returns, and releases it
 * anyway after a short timeout so a throwing handler cannot wedge delivery.
 *
 * All registered handlers run; the notification is suppressed if *any* of them
 * calls `preventDefault()`.
 *
 * **`preventDefault()` is honoured on Android only.** iOS decides presentation
 * synchronously and cannot wait for a JS answer — see
 * {@link NotificationWillDisplayEvent.preventDefault}. The event itself fires on
 * both platforms.
 */
export function onNotificationWillDisplay(
  callback: (event: NotificationWillDisplayEvent) => void
): Subscription {
  willDisplayHandlers.add(callback);
  ensureWillDisplayBridge();
  return {
    remove: () => {
      willDisplayHandlers.delete(callback);
      if (willDisplayHandlers.size === 0) {
        willDisplayBridge?.remove();
        willDisplayBridge = null;
      }
    },
  };
}

type WillDisplayHandler = (event: NotificationWillDisplayEvent) => void;

const willDisplayHandlers = new Set<WillDisplayHandler>();
let willDisplayBridge: EmitterSubscription | null = null;

/**
 * One emitter subscription fans out to every handler, so
 * `completeNotificationWillDisplay` is called exactly once per notification no
 * matter how many handlers are registered. Completing twice would release the
 * same held notification twice on the native side.
 */
function ensureWillDisplayBridge(): void {
  if (willDisplayBridge) return;

  willDisplayBridge = emitter.addListener(
    EVENT.notificationWillDisplay,
    (payload: { notification: PushNotification }) => {
      let prevented = false;
      const event: NotificationWillDisplayEvent = {
        notification: payload.notification,
        preventDefault: () => {
          prevented = true;
        },
      };

      for (const handler of willDisplayHandlers) {
        try {
          handler(event);
        } catch (error) {
          // A throwing handler must not stop the remaining handlers, and must
          // not prevent the completion call below — otherwise the native side
          // holds the notification until its timeout for no reason.
          console.error(
            '[AppPushService] onNotificationWillDisplay handler threw',
            error
          );
        }
      }

      const id = payload.notification?.id;
      if (id != null) {
        NativePush.completeNotificationWillDisplay(id, !prevented).catch(() => {
          // The native side falls back to displaying the notification when the
          // completion never lands, so there is nothing to recover here.
        });
      }
    }
  );
}

/** Fires when the OS notification permission changes. */
export function onPermissionChanged(
  callback: (event: PermissionChangedEvent) => void
): Subscription {
  return subscribe(EVENT.permissionChanged, callback);
}

/** Fires when the push subscription's token or opt-in state changes. */
export function onSubscriptionChanged(
  callback: (event: PushSubscriptionChangedEvent) => void
): Subscription {
  return subscribe(EVENT.subscriptionChanged, callback);
}

/** Fires on {@link login} / {@link logout}. */
export function onUserStateChanged(
  callback: (event: UserStateChangedEvent) => void
): Subscription {
  return subscribe(EVENT.userStateChanged, callback);
}

// MARK: - Default export

const AppPushService = {
  initialize,
  isInitialized,

  getDeviceId,
  getSubscriptionId,
  getExternalId,
  login,
  logout,
  setUserId,

  getToken,
  getDeviceToken,

  requestPermission,
  getPermission,
  getPermissionStatus,
  canRequestPermission,
  registerForProvisionalAuthorization,

  notifications,
  badge,
  user,
  consent,
  debug,

  onNotificationReceived,
  onNotificationOpened,
  onNotificationWillDisplay,
  onPermissionChanged,
  onSubscriptionChanged,
  onUserStateChanged,
};

export default AppPushService;
