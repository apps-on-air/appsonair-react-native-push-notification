import {
  NativeEventEmitter,
  NativeModules,
  Platform,
  TurboModuleRegistry,
  type EmitterSubscription,
} from 'react-native';

import type { Spec } from './NativeAppsonairApppush';
import type {
  InstallationIdEvent,
  LogLevel,
  NotificationOpenedEvent,
  NotificationReceivedEvent,
  NotificationWillDisplayEvent,
  PermissionChangedEvent,
  PermissionStatus,
  PushConfig,
  PushErrorEvent,
  PushNotification,
  PushSubscriptionChangedEvent,
  PushSubscriptionState,
  RequestPermissionOptions,
  SilentNotificationEvent,
  Subscription,
  TokenUpdatedEvent,
  UserStateChangedEvent,
} from './types';

export * from './types';

const LINKING_ERROR =
  `The package 'appsonair-react-native-apppush' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

/**
 * Resolves the native module on both architectures. If it isn't linked, the Proxy
 * throws a clear LINKING_ERROR instead of `undefined is not an object`.
 */
const NativePush: Spec =
  TurboModuleRegistry.get<Spec>('AppsonairReactNativeApppush') ??
  (NativeModules.AppsonairReactNativeApppush as Spec | undefined) ??
  (new Proxy(
    {},
    {
      get() {
        throw new Error(LINKING_ERROR);
      },
    }
  ) as Spec);

const emitter = new NativeEventEmitter(
  // Use the module resolved above: in bridgeless mode NativeModules can be empty.
  NativePush as ConstructorParameters<typeof NativeEventEmitter>[0]
);

// MARK: - Event names
// Also hardcoded in both native bridges and supportedEvents in the .mm; keep in sync.

const EVENT = {
  notificationReceived: 'AppsonairPush:onNotificationReceived',
  notificationOpened: 'AppsonairPush:onNotificationOpened',
  notificationWillDisplay: 'AppsonairPush:onNotificationWillDisplay',
  permissionChanged: 'AppsonairPush:onPermissionChanged',
  subscriptionChanged: 'AppsonairPush:onSubscriptionChanged',
  userStateChanged: 'AppsonairPush:onUserStateChanged',
  tokenUpdated: 'AppsonairPush:onTokenUpdated',
  silentNotification: 'AppsonairPush:onSilentNotification',
  installationIdUpdated: 'AppsonairPush:onInstallationIdUpdated',
  error: 'AppsonairPush:onError',
} as const;

// MARK: - Initialization guard
//
// Calling the Android SDK before initialize() crashes, so reject with the same
// error on both platforms instead.

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

/** Empty strings crash the Android SDK, so reject them here. */
function requireNonEmpty(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PushArgumentError(`${label} must be a non-empty string.`);
  }
}

// MARK: - Lifecycle

/**
 * Starts the SDK. Await this once, before any other call.
 *
 * On Android the wrapper supplies the `Context` itself. On iOS the native SDK
 * was already started at app launch (so a tap that launched the app is not
 * lost); this applies `debug` and releases that tap to `onNotificationOpened`.
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
 * Prompts for notification permission and resolves whether it was granted.
 * Rejects on Android if no Activity is attached.
 */
export function requestPermission(
  options: RequestPermissionOptions = {}
): Promise<boolean> {
  return guard('requestPermission', () =>
    NativePush.requestPermission(options.fallbackToSettings ?? false)
  );
}

/** Whether notifications are currently permitted. */
export function getPermission(): Promise<boolean> {
  return guard('getPermission', () => NativePush.getPermission());
}

/**
 * The detailed permission state. **Android reports only `authorized` or
 * `denied`** (never `notDetermined`).
 */
export function getPermissionStatus(): Promise<PermissionStatus> {
  return guard('getPermissionStatus', () =>
    NativePush.getPermissionStatus()
  ) as Promise<PermissionStatus>;
}

/**
 * Whether a permission prompt can still be shown. iOS returns `true` only before
 * the first prompt; **Android returns `true` whenever permission isn't granted**,
 * even after a permanent denial.
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
   * Dismisses one notification by its payload `notification_id`. On Android the id
   * is hashed, so two ids could rarely collide.
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
   * The badge count. On Android this is the SDK's stored value, which may differ
   * from what the launcher shows.
   */
  get(): Promise<number> {
    return guard('badge.get', () => NativePush.getBadgeCount());
  },

  /**
   * Sets the badge count. On Android this only works on some launchers
   * (e.g. Samsung, MIUI, ASUS).
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
   * The user's tags. **Android fetches them from the backend** (so it can fail
   * offline); **iOS returns its local copy.**
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

  /** Adds an email and syncs it to the backend. */
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
   * The device language. On iOS it's read once at startup, so a change during the
   * session isn't picked up.
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
   * Whether the subscription is enabled on the backend (unlike
   * `getPushSubscription().optedIn`, which only reflects opt-out).
   * - **Android** reads the server's value.
   * - **iOS** computes it: has a token, not opted out, and permission granted.
   */
  getOptedIn(): Promise<boolean> {
    return guard('user.getOptedIn', () => NativePush.getOptedIn());
  },
};

// MARK: - Consent
//
// Note: these flags are stored but not enforced yet; `consentGiven = false` blocks nothing.

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
 * Fires in the foreground before a notification is displayed. Call
 * `preventDefault()` synchronously in any handler to suppress it (**Android only**).
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

/** One native subscription for all handlers, so each notification is completed once. */
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
          // A throwing handler must not block the others or the completion call below.
          console.error(
            '[AppPushService] onNotificationWillDisplay handler threw',
            error
          );
        }
      }

      const id = payload.notification?.id;
      if (id != null) {
        NativePush.completeNotificationWillDisplay(id, !prevented).catch(() => {
          // Native shows the notification on timeout, so nothing to recover.
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

/**
 * Fires when the push token is issued or refreshed. `environment` is
 * `'sandbox'`/`'production'` on iOS and `null` on Android. Events before you
 * subscribe are dropped, so call {@link getToken} for the current value.
 */
export function onTokenUpdated(
  callback: (event: TokenUpdatedEvent) => void
): Subscription {
  return subscribe(EVENT.tokenUpdated, callback);
}

/**
 * Fires on background SDK failures (e.g. token registration, missing Firebase
 * config). Without a subscriber these are silent.
 */
export function onError(
  callback: (event: PushErrorEvent) => void
): Subscription {
  return subscribe(EVENT.error, callback);
}

/** Fires for a data-only push that isn't displayed. See {@link SilentNotificationEvent}. */
export function onSilentNotification(
  callback: (event: SilentNotificationEvent) => void
): Subscription {
  return subscribe(EVENT.silentNotification, callback);
}

/** Fires when the Firebase Installation ID is available. **Android only.** */
export function onInstallationIdUpdated(
  callback: (event: InstallationIdEvent) => void
): Subscription {
  return subscribe(EVENT.installationIdUpdated, callback);
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
  onTokenUpdated,
  onError,
  onSilentNotification,
  onInstallationIdUpdated,
};

export default AppPushService;
