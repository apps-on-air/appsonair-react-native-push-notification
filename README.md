# appsonair-react-native-push

Push notifications for React Native, wrapping the native AppsOnAir SDKs —
[iOS](https://github.com/apps-on-air/appsonair-ios-push-notification) (APNs, no Firebase) and
[Android](https://github.com/apps-on-air/appsonair-android-push-notification) (FCM).

Works on both React Native architectures. New Arch gets a real Codegen
TurboModule, Old Arch gets a Bridge NativeModule — picked at build time, same JS
API either way. Nothing in your app code changes.

> [!WARNING]
> **Alpha release — not for production use.**
>
> `0.0.1-alpha` is an early preview, intended for evaluation, prototypes, and
> internal test builds. Do **not** ship it in a production app or one with a
> large user base.
>
> - The public API may change without notice and may not stay source-compatible —
>   expect to update your integration between releases.
> - Breaking changes are not limited to major versions while the package is pre-1.0.
> - The native SDKs underneath are pre-release too (`0.0.2-alpha`), and carry the
>   same caveats.
> - Not yet proven at scale; some behaviour is still unverified in real-world use.
>
> Pin this exact version rather than a version range, and re-test on every upgrade.

> [!NOTE]
> Both native SDKs resolve on their own — Android from JitPack, iOS from
> CocoaPods — so the only setup you need is in [Setup](#setup). The backend *is*
> live: the SDKs register the device and sync subscription state — tags,
> language, opt-in — to `/v1/subscriptions`.

---

## Install

> **Alpha.** Pin this exact version — the API may change between releases. See
> [the notice above](#appsonair-react-native-push) before adopting it.

```sh
npm install appsonair-react-native-push@0.0.1-alpha
npx pod-install          # iOS only
```

`npm install appsonair-react-native-push` on its own will not find it: alpha
releases are published under the `alpha` dist-tag, not `latest`.

Autolinking does the rest — nothing to add to `MainApplication.kt` or `AppDelegate`.

| Requires | |
|---|---|
| React Native | 0.71+ |
| iOS | 15.0+ |
| Android | minSdk 24 |
| Kotlin | 1.9+ |

---

## Quick start

```ts
import AppPushService from 'appsonair-react-native-push';

async function setupPush() {
  await AppPushService.initialize({ debug: __DEV__ });

  const granted = await AppPushService.requestPermission();
  if (!granted) return;

  // Resolves `null` until registration finishes — call it *after* permission.
  const token = await AppPushService.getToken();
  console.log('push token', token);

  await AppPushService.login('user-42');
}
```

Subscribe to events once near app start, and keep them for the app's lifetime:

```ts
import { useEffect } from 'react';
import AppPushService from 'appsonair-react-native-push';

useEffect(() => {
  const subs = [
    AppPushService.onNotificationReceived(({ notification }) => {
      console.log('foreground', notification.title, notification.data);
    }),

    AppPushService.onNotificationOpened(({ notification, actionId, url }) => {
      if (url) navigate(url);
      else if (actionId === 'reply') openReply(notification.id);
    }),
  ];

  return () => subs.forEach((s) => s.remove());
}, []);
```

Named exports work too, if you prefer them or want tree-shaking:

```ts
import { initialize, getToken, onNotificationOpened, user } from 'appsonair-react-native-push';
```

---

## Setup

### iOS

1. **Signing & Capabilities → + Capability → Push Notifications.**
2. Add **Background Modes → Remote notifications** if you use silent push.
3. Add your AppsOnAir app id to `Info.plist`:

```xml
<key>AppsonairAppId</key>
<string>your-app-id</string>
```

<details>
<summary><b>App Groups</b> — needed for delivery receipts from a Notification Service Extension</summary>

There's no `appGroupId` option in `initialize()` because the native initializer
doesn't take one. iOS resolves the group itself: an `AppsOnAirAppGroup` string in
`Info.plist`, else the convention `group.<your-bundle-id>.appsonair`.

Enable that group on **both** the app target and your Notification Service
Extension — otherwise the extension's delivery receipts degrade silently.
</details>

<details>
<summary><b>Build fails with <code>__swift_FORCE_LOAD_$_swiftCompatibility56</code></b> — required if your app target has no Swift file</summary>

This wrapper and the SDKs beneath it are Swift static libraries. Xcode only adds
the Swift runtime search paths to a target that *contains* Swift, so a pure
Objective-C app (`AppDelegate.mm`, `main.m`, nothing else) fails to link:

```
Undefined symbols: __swift_FORCE_LOAD_$_swiftCompatibility56
  referenced from libAppsOnAir-Core.a, libAppsOnAir-AppPush.a,
                  libReachabilitySwift.a, libappsonair-react-native-push.a
```

**Simplest fix** — add any empty `.swift` file to your app target and let Xcode
create the bridging header it offers. The file can stay empty.

**Or** add the paths in your Podfile's `post_install` (what `example/ios/Podfile` does):

```ruby
installer.aggregate_targets.each do |aggregate_target|
  aggregate_target.user_project.native_targets.each do |target|
    target.build_configurations.each do |build_config|
      build_config.build_settings['LIBRARY_SEARCH_PATHS'] = [
        '$(inherited)',
        # DT_TOOLCHAIN_DIR, not TOOLCHAIN_DIR -- the latter resolves to the
        # Metal toolchain under Xcode 26 and the path does not exist.
        '$(DT_TOOLCHAIN_DIR)/usr/lib/swift/$(PLATFORM_NAME)',
        '/usr/lib/swift'
      ]
    end
  end
  aggregate_target.user_project.save
end
```

This bites on Old Arch first. New Arch builds often link anyway because other
Swift-bearing pods pull the paths in — that's luck, not design. Apply it regardless.
</details>

<details>
<summary><b>Background sync</b> — extra <code>Info.plist</code> key</summary>

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array><string>com.appsonair.push.background-sync</string></array>
```
</details>

<details>
<summary><b>Pointing at a local iOS SDK checkout</b> — for SDK development, or if the pod hasn't propagated yet</summary>

This package depends on `AppsOnAir-AppPush` `0.0.2-alpha` from the CocoaPods
trunk, so `npx pod-install` normally needs no help. To build against a local
checkout instead, declare it in your app's Podfile — a `:path` declaration wins
over this package's dependency line:

```ruby
# ios/Podfile
pod 'AppsOnAir-AppPush', :path => '../../appsonair-ios-push-notification'
```

If `pod install` can't find the pod at all, refresh your spec repo first with
`pod repo update`.
</details>

### Android

The native SDK is on JitPack, and Firebase is required.

```groovy
// android/settings.gradle
dependencyResolutionManagement {
  repositories {
    google()
    mavenCentral()
    maven { url 'https://jitpack.io' }   // AppsOnAir Push SDK + AppsOnAir Core
  }
}
```

Add the Google Services plugin and your `google-services.json` as you would for
any FCM app. `POST_NOTIFICATIONS` (Android 13+) is requested for you by
`requestPermission()`.

<details>
<summary><b>Overriding the Push SDK coordinate</b> — for a local build or a private repo</summary>

This package pins the released SDK. To point at something else, set the coordinate
from your app's `android/gradle.properties` — no need to patch this package:

```properties
# The default. The `v` prefix is the JitPack tag's, not a different release.
AppsonairReactNativePush_pushSdkCoordinate=com.github.apps-on-air:appsonair-android-push-notification:v0.0.2-alpha
```
</details>

---

## Recipes

**Ask for permission at the right moment, not on launch**

```ts
if (await AppPushService.getPermission()) return;   // already granted, don't re-prompt

// `fallbackToSettings` sends the user to the OS settings screen when they've
// already permanently denied — without it the prompt just fails silently.
const granted = await AppPushService.requestPermission({ fallbackToSettings: true });
```

**Identify a user, and tag them for targeting**

```ts
await AppPushService.login('user-42');
await AppPushService.user.addTags({ plan: 'pro', locale: 'en-IN' });
await AppPushService.user.addEmail('someone@example.com');

// On sign-out
await AppPushService.logout();
```

**Deep link from a notification tap**

```ts
AppPushService.onNotificationOpened(({ notification, actionId, url }) => {
  if (actionId) return handleAction(actionId, notification);
  if (url) return Linking.openURL(url);
  navigateToInbox();
});
```

**Suppress a foreground notification** (Android only — see [Platform differences](#platform-differences))

```ts
AppPushService.onNotificationWillDisplay(({ notification, preventDefault }) => {
  // Must be called synchronously — native is holding the notification.
  if (notification.data.screen === currentScreen) preventDefault();
});
```

**Keep the badge tidy**

```ts
await AppPushService.badge.set(unreadCount);
await AppPushService.badge.clear();
await AppPushService.badge.setAutoClearOnForeground(true);   // iOS only
```

**Forward the token to your own backend**

There's no `onTokenUpdated` event today, so poll for it after permission resolves:

```ts
const token = await AppPushService.getToken();
if (token) await api.registerDevice(token);
```

---

## API

Everything returns a `Promise` (except `isInitialized()`, which is synchronous)
and rejects rather than throwing natively.

Calling anything before `initialize()` resolves rejects with `notInitialized` on
both platforms — without that guard the native Android SDK would throw
`IllegalStateException` and crash the app.

**Lifecycle**

| | |
|---|---|
| `initialize(config?)` | `{ debug?: boolean }`. Await once at app start. |
| `isInitialized()` | Synchronous `boolean`. |

**Identity**

| | |
|---|---|
| `login(externalId)` · `setUserId(externalId)` | Aliases. Rejects on an empty string. |
| `logout()` | Back to an anonymous subscription. |
| `getExternalId()` | `null` while anonymous. |
| `getDeviceId()` | AppsOnAir device id. |
| `getSubscriptionId()` | Backend-assigned; `null` until registered. |

**Token**

| | |
|---|---|
| `getToken()` · `getDeviceToken()` | Aliases. APNs hex on iOS, FCM token on Android. `null` before registration. |

**Permissions**

| | |
|---|---|
| `requestPermission({ fallbackToSettings? })` | Resolves the resulting grant state. Rejects with `noActivity` on Android if there's no foreground Activity. |
| `getPermission()` | Fresh read on both platforms. |
| `getPermissionStatus()` | Five states on iOS; **only `authorized` / `denied` on Android**. |
| `canRequestPermission()` | Semantics differ per platform — see [Platform differences](#platform-differences). |
| `registerForProvisionalAuthorization()` | iOS only. |

**`notifications`**

| | |
|---|---|
| `clearAll()` | |
| `remove(id)` | Payload `notification_id`. |
| `removeMany(ids)` | One native call on iOS; loops on Android. |
| `removeGroup(groupKey)` | Android only. |

**`badge`**

| | |
|---|---|
| `get()` · `set(n)` · `increment(delta?)` · `clear()` | Best-effort on Android — see [Platform differences](#platform-differences). |
| `setAutoClearOnForeground(enabled)` | iOS only. |

**`user`**

```ts
user.getAppsOnAirId()   user.getExternalId()
user.addTag(k, v)       user.addTags(obj)      user.getTags()
user.removeTag(k)       user.removeTags(keys)
user.addAlias(l, id)    user.addAliases(obj)
user.removeAlias(l)     user.removeAliases(labels)
user.addEmail(addr)     user.removeEmail(addr)
user.setLanguage(code)  user.getLanguage()
user.getPushSubscription()   // { id, token, optedIn }
user.optIn()            user.optOut()          user.getOptedIn()
```

**`consent`** — `setRequired` / `getRequired` / `setGiven` / `getGiven`
(stored, but [not enforced yet](#platform-differences)).

**`debug`** — `setLogLevel(level)`, safe to call before `initialize()`.

### Events

Each returns a `Subscription` with `.remove()`.

| Event | Payload |
|---|---|
| `onNotificationReceived` | `{ notification }` |
| `onNotificationOpened` | `{ notification, actionId, url }` |
| `onNotificationWillDisplay` | `{ notification, preventDefault() }` |
| `onPermissionChanged` | `{ granted }` |
| `onSubscriptionChanged` | `{ previous, current }` |
| `onUserStateChanged` | `{ current }` |

On the wire these are `AppsonairPush:onNotificationReceived`,
`AppsonairPush:onNotificationOpened` and so on — both native bridges emit that
prefix. You only need the raw names if you subscribe through
`NativeEventEmitter` yourself instead of using the helpers above.

<details>
<summary><b>Native methods deliberately not exported to JS</b></summary>

The native SDKs and the Codegen spec still implement these — the JS layer just
doesn't export them. Nothing native was removed, so re-exposing any of them is a
change to `src/index.tsx` alone.

`setSubscriptionId`, `refreshToken`, `getInstallationId`, `getApnsEnvironment`,
`notifications.createChannel` / `deleteChannel`, `setTestDevice` / `isTestDevice`,
`scheduleBackgroundSync` / `cancelBackgroundSync`,
`setAutoRegisterForRemoteNotifications`, and the `onTokenUpdated`,
`onSilentNotification`, `onInstallationIdUpdated` and `onError` events.

Two consequences worth knowing:

- **Async native errors have no JS surface.** Both bridges still emit
  `AppsonairPush:onError`, but nothing subscribes, so RN drops it. Failures that
  don't belong to a specific promise are visible only in the native log — run
  `debug.setLogLevel('debug')` before `initialize()`.
- **Token delivery is pull-only.** Without `onTokenUpdated` you have to poll
  `getToken()` to forward the token to your backend.
</details>

---

## Platform differences

Not wrapper bugs — places where the two native SDKs genuinely behave differently
and no bridge can honestly hide it. Each cites its row in
`CROSS_PLATFORM_PARITY.md` in the Android SDK repo.

| Area | Behaviour |
|---|---|
| **`preventDefault()`** (F7) | **Android only.** Android calls foreground listeners on FCM's background thread, so the bridge can wait for your handler. iOS returns presentation options synchronously — the notification is already on screen by the time JS runs. The event fires on both. |
| **`canRequestPermission()`** (E2) | iOS returns `true` only before the user has ever been asked. **Android returns `true` whenever permission isn't granted, including after a permanent denial.** Don't use it to decide whether to show a pre-prompt cross-platform. |
| **`user.addEmail()`** (A5) | Android persists emails but never reads them back on restart, so they're lost on relaunch. Needs an SDK fix. |
| **Badges** (G1, G3) | iOS uses the OS API. Android uses launcher broadcasts that **silently do nothing outside Samsung / MIUI / ASUS**, and `badge.get()` returns the SDK's own persisted count, which can drift from what's on screen. |
| **`user.getTags()`** | Both are backend-backed, but refresh differently. **Android fetches on every call**, so it sees other devices' writes immediately and can reject on network failure. **iOS reads a local cache** the SDK refreshes on `initialize()`, on first registration, on `login()`, and on every tag write — so a tag set elsewhere mid-session lands on iOS only after one of those. Neither call fetches before the device has registered; both fall back to the local cache. |
| **`user.getOptedIn()`** | Android reads the stored value from `/subscriptions`; iOS computes the flag it would send, which also requires OS permission. Revoking permission in Settings flips iOS to `false` while Android still reports the server's value. Both differ from `getPushSubscription().optedIn`, which is purely local on both. |
| **Payload keys** (C1, F1) | `subtitle`, `attachments`, `badgeIncrement`, `campaignId`, `templateId`, `sentAt` are iOS-only; `sound` and `channelId` are Android-only. The wrapper resolves the rest to `null` / `[]`, so the object shape is always the same. |
| **Device language** (1.5) | Android reads it live; iOS snapshots it once at init, so a mid-session change is stale on iOS. |
| **Consent flags** (I5) | `consentRequired` / `consentGiven` round-trip but **neither SDK enforces them yet**. Not a compliance control. |
| **`notifications.remove()`** (F2) | iOS matches the request identifier exactly; Android hashes the id, so two ids could in principle collide. |

---

## Troubleshooting

**"doesn't seem to be linked"** — rebuild after installing (a Metro restart isn't
enough), run `npx pod-install`, and check you're not on Expo Go, which can't load
custom native modules.

**iOS token never arrives** — confirm the Push Notifications capability is on the
target and `AppsonairAppId` is in `Info.plist`. The SDK logs the reason:

```ts
await AppPushService.debug.setLogLevel('debug');   // before initialize()
```

**Android taps do nothing on warm start** — the wrapper registers RN's
`ActivityEventListener` and forwards `onNewIntent` itself, so this shouldn't
happen. If it does, confirm your `MainActivity` isn't consuming the intent before
React Native sees it.

---

## Example app

`example/` is a full RN app that exercises the public API and reports which
native path actually loaded, so you can run the same screen against both
architectures and compare.

```sh
npm install            # from the repo root -- installs the example workspace too

cd example
npm run android:new    # newArchEnabled=true       -> TurboModule
npm run android:old    # newArchEnabled=false      -> Bridge
npm run ios:new        # RCT_NEW_ARCH_ENABLED=1 pod install, then run
npm run ios:old        # RCT_NEW_ARCH_ENABLED=0 pod install, then run
```

Architecture is a build-time choice on both platforms — a Metro reload won't
switch it, and Android needs `./gradlew clean` between switches because Gradle
caches the generated Codegen sources.

The example resolves the **published** native SDKs (`0.0.2-alpha`) the same way
your app does — JitPack on Android, CocoaPods on iOS. Building against sibling
checkouts of the SDKs instead is opt-in: `-PappsonairLocalSdk=true` on Android,
`APPSONAIR_LOCAL_SDK=1` on iOS. See `example/README.md`.

---

## Contributing

<details>
<summary><b>How both architectures are supported</b></summary>

- **One spec.** `src/NativeAppsonairPush.ts` is the Codegen spec, and also the
  only method list — the JS layer, both Android modules and the iOS bridge are
  all checked against it.
- **Android** compiles `src/newarch` or `src/oldarch` depending on
  `newArchEnabled`. Both declare the same class in the same package and differ
  only in their base class (`NativeAppsonairPushSpec` vs
  `ReactContextBaseJavaModule`); all behaviour lives in the shared
  `AppsonairReactNativePushModuleImpl`.
- **iOS** uses one `RCT_EXPORT_METHOD` body per method. Codegen derives its ObjC
  selectors from the same JS names the macro does, so a single implementation
  satisfies the `NativeAppsonairPushSpec` protocol on New Arch and registers with
  the bridge on Old. `#ifdef RCT_NEW_ARCH_ENABLED` covers only the adopted
  protocol and `getTurboModule:`.

**Adding a method** means changing all four: the spec, both Android modules, and
the iOS `.mm` + Swift impl. Codegen catches a missing Android override and a
missing iOS selector at compile time — but the Old Architecture module isn't
checked, so that one's on you.
</details>

---

## License

MIT
