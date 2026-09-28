# AppsOnAir Push — example app

A runnable React Native app for trying out and testing
`appsonair-react-native-apppush`. Every button calls one SDK method, input fields
let you use your own values, and the log at the bottom shows each result and
event as it happens.

## Setup

### 1. Install

From the **repo root** (not this folder):

```sh
npm install
```

Use npm or Yarn 3+. Yarn 1 is not supported.

### 2. Add your AppsOnAir app id

Replace the `your-appsonair-app-id` placeholder in both files:

| Platform | File |
|---|---|
| Android | `android/app/src/main/AndroidManifest.xml` |
| iOS | `ios/AppsOnAirPushExample/Info.plist` |

### 3. Android — add Firebase

1. In the Firebase console, add an Android app with package name
   `com.appsonairpushexample` (or your own — see below).
2. Download `google-services.json` into `android/app/`. It is gitignored.

Without it the app still builds, but `initialize()` fails with
*Default FirebaseApp is not initialized*.

### 4. iOS — signing

Open `ios/AppsOnAirPushExample.xcworkspace` in Xcode, select the
**AppsOnAirPushExample** target, then under *Signing & Capabilities*:

- Pick your team and set a bundle id you can sign.
- Make sure **Push Notifications** is enabled for it.

Push notifications need a **real device** — the simulator has no APNs token.

> Using your own package name / bundle id? Update `applicationId` in
> `android/app/build.gradle` too, and register that id in Firebase. Keep these
> local changes out of commits.

## Run

```sh
cd example
npm run android
npm run ios
```

To test a specific React Native architecture:

```sh
npm run android:new    # New Architecture
npm run android:old    # Old Architecture
npm run ios:new
npm run ios:old
```

The banner at the top shows which architecture actually loaded. Switching needs
a rebuild, not a Metro reload. On Android, run `cd android && ./gradlew clean`
between switches.

## Test checklist

The app calls `initialize()` on launch — the banner shows *SDK initialized*
when it's ready.

| # | Do | Expect |
|---|---|---|
| 1 | **requestPermission** | System prompt; log shows `true` once granted. |
| 2 | **getToken** | A token (may take a few seconds after permission). |
| 3 | Enter an id → **login** → **getExternalId** | Returns the id you entered. |
| 4 | Clear the id → **login** | Rejects with `invalidArgument`, no crash. |
| 5 | Tags: key + value → **addTag** → **getTags** | Your tag appears. |
| 6 | Aliases: label + id → **addAlias** | Resolves; alias visible in the dashboard. |
| 7 | Email → **addEmail** | Resolves; email visible in the dashboard. |
| 8 | Language → **setLanguage** → **getLanguage** | Returns the code you set. |
| 9 | Send a push with the app open | `⚡ onNotificationReceived` in the log. |
| 10 | Tap a notification | **One** `⚡ onNotificationOpened` line — `action=body` for a body tap, the button id for an action button. |
| 11 | **logout** → **getExternalId** | `null`. |

Test on both Android and iOS — the same steps should give the same results. See
[Platform differences](../README.md#platform-differences) for the few expected
exceptions.

<details>
<summary><b>Testing against a local native SDK checkout</b></summary>

By default the example uses the published native SDKs, exactly like a real app.
To build against local checkouts placed next to this repo:

```sh
# Android — ../appsonair-push-notification-android
cd android && ./gradlew -PappsonairLocalSdk=true :app:assembleDebug

# iOS — ../appsonair-ios-push-notification
APPSONAIR_LOCAL_SDK=1 npm run pods:new
```
</details>

## Troubleshooting

**Android: `NDK ... did not have a source.properties file`** — the NDK is only
partly installed. Reinstall it from Android Studio → SDK Manager → SDK Tools →
NDK.

**Android: `cannot find symbol NativeAppsonairApppushSpec`** — stale generated
code after an architecture switch. Run `cd android && ./gradlew clean`.

**iOS: `Undefined symbols: __swift_FORCE_LOAD_$_swiftCompatibility56`** — the
`post_install` block in `ios/Podfile` fixes this; don't remove it.

**"The package doesn't seem to be linked"** — rebuild the app (`npm run android`
/ `npm run ios`); for iOS, run `pod install` first.
