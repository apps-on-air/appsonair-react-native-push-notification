# appsonair-react-native-apppush

AppsOnAir push notifications for React Native — iOS (APNs) and Android (FCM),
one JavaScript API. Works on both the New and the Old Architecture with no code
changes.

> [!WARNING]
> **Beta** `1.0.3-beta` is intended for evaluation and
> internal test builds. The API may change between releases, so pin the exact
> version and re-test on every upgrade.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [iOS setup](#ios-setup)
- [Android setup](#android-setup)
- [Usage](#usage)
- [API reference](#api-reference)
- [Platform differences](#platform-differences)
- [Troubleshooting](#troubleshooting)

## Requirements

| | |
|---|---|
| React Native | 0.71+ |
| iOS | 15.0+ |
| Android | minSdk 24 |
| AppsOnAir | An app id from the AppsOnAir dashboard |

## Installation

```sh
npm install appsonair-react-native-apppush@1.0.3-beta
cd ios && pod install
```

Autolinking handles the rest — nothing to add to `AppDelegate` or
`MainApplication`. Rebuild the app after installing; a Metro reload is not enough.

## iOS setup

**1. Capabilities** — in Xcode, select your app target → *Signing & Capabilities*:

- **+ Capability → Push Notifications**
- **+ Capability → Background Modes** → tick **Remote notifications** (needed for silent pushes)

**2. App id** — add it to `ios/<YourApp>/Info.plist`:

```xml
<key>AppsonairAppId</key>
<string>YOUR_APPSONAIR_APP_ID</string>
```

That's all a basic setup needs. Test on a real device — the simulator has no APNs token.

<details>
<summary><b>Rich notifications</b> — images, video, badge increments and delivery tracking</summary>

iOS only shows images and attachments if a **Notification Service Extension**
(NSE) downloads them. Android needs nothing extra.

1. In Xcode: **File → New → Target → Notification Service Extension**, e.g.
   `NotificationService`. Xcode sets the new target's **iOS Deployment Target**
   to the latest iOS; lower it to match your app (15.0 or higher), or iOS will
   never run the extension on older devices.
2. Add an **App Group** to **both** the app target and the extension target,
   named `group.<your-app-bundle-id>.appsonair`. If you use another name, add it
   to both `Info.plist` files:

   ```xml
   <key>AppsOnAirAppGroup</key>
   <string>group.com.yourcompany.app.appsonair</string>
   ```

3. Add the extension target to `ios/Podfile`, using the target's exact name
   from Xcode, then run `pod install`:

   ```ruby
   target 'NotificationService' do
     pod 'AppsOnAir-AppPush/ServiceExtension', '1.0.4-beta'
   end
   ```

4. Replace the generated `NotificationService.swift`:

   ```swift
   import AppsOnAir_AppPush

   class NotificationService: AppsOnAirNotificationServiceExtension {}
   ```

Pushes must have `"mutable-content": 1` in `aps`, otherwise iOS never runs the
extension.
</details>

<details>
<summary><b>Background sync</b> — optional</summary>

To let the SDK sync in the background, add to `Info.plist`:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array><string>com.appsonair.push.background-sync</string></array>
```
</details>

## Android setup

**1. JitPack** — the native SDK is hosted there. Add it to `android/build.gradle`
(under `allprojects.repositories`) or `android/settings.gradle`:

```groovy
maven { url 'https://jitpack.io' }
```

**2. Firebase** — set up FCM as for any Android app:

- Place `google-services.json` in `android/app/`.
- `android/build.gradle` → `dependencies`: `classpath("com.google.gms:google-services:4.4.2")`
- `android/app/build.gradle` → bottom of file: `apply plugin: "com.google.gms.google-services"`

**3. App id** — add it inside `<application>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<meta-data
    android:name="AppsonairAppId"
    android:value="YOUR_APPSONAIR_APP_ID" />
```

The `POST_NOTIFICATIONS` permission (Android 13+) is declared by the SDK and
requested by `requestPermission()`.

<details>
<summary><b>Notification icon and colour</b> — recommended</summary>

Without these, notifications use your launcher icon, which Android renders as a
white square. Add a monochrome icon to `res/drawable`, then inside `<application>`:

```xml
<!-- Used by notifications the SDK displays -->
<meta-data android:name="com.appsonair.apppush.default_notification_icon"
           android:resource="@drawable/ic_notification" />
<meta-data android:name="com.appsonair.apppush.default_notification_color"
           android:resource="@color/notification_accent" />

<!-- Used by notifications Firebase displays while the app is in the background -->
<meta-data android:name="com.google.firebase.messaging.default_notification_icon"
           android:resource="@drawable/ic_notification" />
<meta-data android:name="com.google.firebase.messaging.default_notification_color"
           android:resource="@color/notification_accent" />
```

Set both pairs to the same values so every notification looks the same.
</details>

## Usage

### Initialize and ask for permission

Call `initialize()` once, as early as possible. Every other method rejects with
`notInitialized` until it resolves.

On iOS the native SDK already starts at app launch, so no `AppDelegate` code is
needed. That's what lets it record a tap that opens a killed app. The tap is held
and delivered to `onNotificationOpened` once `initialize()` resolves, the same as
on Android.

```ts
import AppPushService from 'appsonair-react-native-apppush';

await AppPushService.initialize({ debug: __DEV__ });

const granted = await AppPushService.requestPermission();
```

Prefer asking at a meaningful moment rather than on first launch:

```ts
if (!(await AppPushService.getPermission())) {
  // Opens the OS settings screen if the user has already denied permanently.
  await AppPushService.requestPermission({ fallbackToSettings: true });
}
```

### Handle notifications

Subscribe once near app start. Each helper returns a subscription to remove on cleanup.

```ts
import { useEffect } from 'react';
import { Linking } from 'react-native';
import AppPushService from 'appsonair-react-native-apppush';

useEffect(() => {
  const subs = [
    // A notification arrived while the app was in the foreground.
    AppPushService.onNotificationReceived(({ notification }) => {
      console.log(notification.title, notification.data);
    }),

    // The user tapped the notification (actionId null) or an action button.
    AppPushService.onNotificationOpened(({ notification, actionId, url }) => {
      if (actionId === 'reply') return openReply(notification.id);
      if (url) return Linking.openURL(url);
    }),
  ];
  return () => subs.forEach((s) => s.remove());
}, []);
```

Custom keys you send in the push are available as `notification.data` (string values).

### Identify users

Link the device to your own user id so you can target that user from AppsOnAir:

```ts
await AppPushService.login('user-42');     // after sign-in
await AppPushService.logout();             // on sign-out
```

### Segment with tags, aliases and email

```ts
await AppPushService.user.addTags({ plan: 'pro', city: 'pune' });
await AppPushService.user.addAlias('crm_id', 'c-1001');
await AppPushService.user.addEmail('jane@example.com');
await AppPushService.user.setLanguage('en');
```

### Send the token to your backend

Only needed if your own server also stores device tokens.

```ts
const token = await AppPushService.getToken();   // null until registered
if (token) await api.saveToken(token);

AppPushService.onTokenUpdated(({ token }) => api.saveToken(token));
```

### Badge

```ts
await AppPushService.badge.set(3);
await AppPushService.badge.clear();
```

### Hide a notification in the foreground (Android only)

```ts
AppPushService.onNotificationWillDisplay(({ notification, preventDefault }) => {
  // Call synchronously — the SDK is waiting on this handler.
  if (notification.data.chatId === openChatId) preventDefault();
});
```

## API reference

All methods return a `Promise` except `isInitialized()`. Import the default
`AppPushService` object, or named exports:
`import { initialize, user, onNotificationOpened } from 'appsonair-react-native-apppush'`.

### Setup and identity

| Method | Description |
|---|---|
| `initialize({ debug? })` | Starts the SDK. Call once at startup. |
| `isInitialized()` | `boolean`, synchronous. |
| `login(externalId)` | Links the device to your user id. Alias: `setUserId`. |
| `logout()` | Unlinks the user; the device becomes anonymous. |
| `getExternalId()` | Current user id, or `null`. |
| `getDeviceId()` | AppsOnAir device id. |
| `getSubscriptionId()` | AppsOnAir subscription id, or `null` before registration. |
| `getToken()` | APNs token (iOS) / FCM token (Android), or `null`. Alias: `getDeviceToken`. |

### Permission

| Method | Description |
|---|---|
| `requestPermission({ fallbackToSettings? })` | Shows the system prompt. Resolves `true` if granted. |
| `getPermission()` | `true` if notifications are allowed. |
| `getPermissionStatus()` | `'authorized'`, `'denied'`, `'notDetermined'`, `'provisional'` or `'ephemeral'`. Android returns only the first two. |
| `canRequestPermission()` | Whether the prompt can still be shown. Behaves differently per platform — see below. |
| `registerForProvisionalAuthorization()` | iOS only. Quiet notifications without a prompt. |

### `user`

| Method | Description |
|---|---|
| `addTag(key, value)` · `addTags(obj)` | Add or update tags. |
| `removeTag(key)` · `removeTags(keys)` | Remove tags. |
| `getTags()` | Current tags. |
| `addAlias(label, id)` · `addAliases(obj)` | Add your own identifiers. |
| `removeAlias(label)` · `removeAliases(labels)` | Remove identifiers. |
| `addEmail(address)` · `removeEmail(address)` | Link an email address. |
| `setLanguage(code)` · `getLanguage()` | Language used to localize notifications. |
| `optIn()` · `optOut()` · `getOptedIn()` | Turn delivery to this device on or off. |
| `getPushSubscription()` | `{ id, token, optedIn }`. |
| `getAppsOnAirId()` | AppsOnAir device id. |

### `notifications`

| Method | Description |
|---|---|
| `clearAll()` | Removes all delivered notifications. |
| `remove(id)` · `removeMany(ids)` | Removes specific notifications. |
| `removeGroup(groupKey)` | Android only. |

### `badge`

| Method | Description |
|---|---|
| `get()` · `set(n)` · `increment(delta?)` · `clear()` | App icon badge. |
| `setAutoClearOnForeground(enabled)` | iOS only. Clear the badge when the app opens. |

### `debug`

| Method | Description |
|---|---|
| `setLogLevel(level)` | `'none'` … `'verbose'`. Can be called before `initialize()`. |

### Events

Each returns `{ remove() }`.

| Event | Payload | Fires when |
|---|---|---|
| `onNotificationReceived` | `{ notification }` | A notification arrives in the foreground. |
| `onNotificationOpened` | `{ notification, actionId, url }` | The user taps a notification (`actionId` is `null`) or an action button. |
| `onNotificationWillDisplay` | `{ notification, preventDefault }` | Just before a foreground notification is shown. |
| `onTokenUpdated` | `{ token }` | The push token is issued or changes. |
| `onPermissionChanged` | `{ granted }` | Notification permission changes. |
| `onSubscriptionChanged` | `{ previous, current }` | Token or opt-in state changes. |
| `onUserStateChanged` | `{ current }` | `login()` / `logout()` changes the user. |
| `onSilentNotification` | `{ data }` | A data-only push arrives. |
| `onError` | `{ code, message }` | A background SDK error, e.g. token registration failed. |

### Notification object

Main fields of `notification`:

| Field | Description |
|---|---|
| `id` | Notification id. |
| `title` · `body` | Text shown to the user. |
| `launchUrl` | Deep link, if the push has one. |
| `imageUrl` | Image URL, if the push has one. |
| `actionButtons` | `[{ id, title }]`. |
| `data` | Your custom key–value data. |

## Platform differences

| Feature | iOS | Android |
|---|---|---|
| `preventDefault()` in `onNotificationWillDisplay` | Ignored — the notification is still shown. | Hides the notification. |
| `canRequestPermission()` | `true` only if the user has never been asked. | `true` whenever permission isn't granted. |
| `user.addEmail()` | Keeps a list of emails. | Keeps one; a new email replaces the old one. |
| `user.getTags()` | Returns cached tags (refreshed on init, login and writes). | Fetches from the server each call. |
| Badges | Always works. | Only on launchers that support it (Samsung, Xiaomi, ASUS). |
| Rich images | Requires a Notification Service Extension. | Works out of the box. |
| Simulator / emulator | No real token on the simulator. | Works on emulators with Google Play. |

## Troubleshooting

**"The package doesn't seem to be linked"** — run `pod install`, then rebuild the
app. Expo Go is not supported; use a development build.

**No token / no notifications** — turn on logs and check the console:

```ts
await AppPushService.debug.setLogLevel('verbose');   // before initialize()
```

Then check:

- iOS: the Push Notifications capability is enabled, `AppsonairAppId` is in
  `Info.plist`, and you're testing on a real device.
- Android: `google-services.json` matches your `applicationId`, and the
  `AppsonairAppId` meta-data is set.

**iOS build fails with `Undefined symbols: __swift_FORCE_LOAD_$_swiftCompatibility56`** —
your app target has no Swift files. In Xcode, add an empty `.swift` file to the
app target and accept the bridging header it offers.

**iOS images don't show** — set up the [Notification Service
Extension](#ios-setup) and make sure the push has `"mutable-content": 1`. If
the extension never runs, check that its iOS Deployment Target isn't higher
than the device's iOS version; iOS skips the extension without logging anything.

**`pod install` fails with `Unable to find compatibility version string for object
version 70`** — Xcode 16+ adds new targets as synchronized folders, which
CocoaPods can't read yet. In Xcode, right-click the extension's folder →
**Convert to Group**, then run `pod install` again.

**`pod install` still installs an older `AppsOnAir-AppPush` after upgrading** —
your `Podfile.lock` is pinning it. Run `pod update AppsOnAir-AppPush`.

## Example app

[`example/`](example) is a runnable app that exercises every API, with input
fields for testing your own values.

```sh
npm install
cd example
npm run android     # or: npm run ios
```

## License

MIT
