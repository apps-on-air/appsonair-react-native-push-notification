# AppsOnAir Push — example app

A test harness for `appsonair-react-native-push`. Every button calls the public
API; the banner at the top reports which native path actually loaded, so running
the same screen on both builds is a real comparison rather than an assumption.

```
New Architecture              Old Architecture
TurboModule (Codegen)         Bridge (NativeModule)
ios · bridgeless true …       ios · bridgeless false …
```

That banner reads runtime globals (`__turboModuleProxy`, `RN$Bridgeless`,
`nativeFabricUIManager`), not anything this library sets — it cannot report the
wrong answer just because the library misbehaved.

## Prerequisites

By default this example resolves the **published** native SDKs (`0.0.2-alpha`) —
JitPack on Android, the CocoaPods trunk on iOS — so it exercises exactly the
dependency path a host app gets. Nothing extra to set up.

Two things are checked in as **placeholders**, and the app will build but not
receive anything until you replace them with your own:

| Where | Placeholder | Replace with |
|---|---|---|
| `android/app/src/main/AndroidManifest.xml` | `AppsonairAppId` = `your-appsonair-app-id` | your AppsOnAir app id |
| `ios/AppsOnAirPushExample/Info.plist` | `AppsonairAppId` = `your-appsonair-app-id` | your AppsOnAir app id |

**Android also needs Firebase.** `android/app/google-services.json` is a **stub**
— valid enough for the build and for CI, useless for delivery. Register
`com.appsonairpushexample` in your own Firebase project, download the real file
over it, and take care not to commit it back. The native SDK uses FCM and will
not produce a token without it.

iOS uses APNs directly, so it needs no Firebase file — but it does need the Push
Notifications capability on the target and a real `AppsonairAppId` in
`Info.plist`.

**Release builds run R8.** `enableProguardInReleaseBuilds` is on, unlike the
stock React Native template, so `./gradlew :app:assembleRelease` exercises the
minified path that a real published app takes. CI builds it on every push — an
AAR is never minified itself, so this is the only place stripping shows up.

## Install

From the repo root:

```sh
npm install
```

Use npm or Yarn 3+, not Yarn 1. This package is published, so it cannot be
`"private": true`, and Yarn 1 refuses workspaces in a non-private project. Yarn 3+
works and reads `.yarnrc.yml` for the node-modules linker.

## Building against local SDK checkouts

For SDK development, both platforms can be pointed at sibling checkouts instead
of the published artifacts:

```
logicwind/
├── appsonair-push-notification-android/
├── appsonair-ios-push-notification/
└── appsonair-react-native-push-notification/   ← this repo
    └── example/
```

**Android** — set the property, either per-invocation or in
`android/gradle.properties`:

```sh
cd android && ./gradlew -PappsonairLocalSdk=true :app:assembleDebug
```

```properties
# android/gradle.properties -- sticky, so `npm run android:new` picks it up too
appsonairLocalSdk=true
```

`settings.gradle` maps the SDK's `:push` Gradle project in, and `build.gradle`
substitutes it for the `com.github.apps-on-air:appsonair-android-push-notification`
coordinate the wrapper pins. Off by default, both are no-ops.

**iOS** — an environment variable at `pod install` time, since that is when the
Podfile is evaluated:

```sh
APPSONAIR_LOCAL_SDK=1 npm run pods:new
```

A `:path` declaration wins over the wrapper podspec's `s.dependency` line.
Re-run `npm run pods:new` without the variable to go back to the published pod.

## Running

The architecture is a **build-time** choice on both platforms, so switching means
a rebuild — a Metro reload will not do it.

```sh
# Android
npm run android:new     # newArchEnabled=true  → TurboModule
npm run android:old     # newArchEnabled=false → Bridge

# iOS
npm run ios:new         # RCT_NEW_ARCH_ENABLED=1 pod install, then run
npm run ios:old         # RCT_NEW_ARCH_ENABLED=0 pod install, then run
```

`arch:new` / `arch:old` only rewrite `newArchEnabled` in
`android/gradle.properties`; iOS is switched by the environment variable at
`pod install` time, which is why it has its own pair of scripts.

**Clean between Android switches.** Gradle caches the generated Codegen sources,
and switching without a clean is the usual cause of a "cannot find symbol
`NativeAppsonairPushSpec`" or a stale module:

```sh
cd android && ./gradlew clean && cd ..
```

## What to check on each build

1. **Banner** — reports the architecture you intended to build.
2. **`initialize`** — then the banner's last line flips to *initialized*.
3. **Guard check before `initialize`** — press *guard check* on a fresh launch.
   It must **reject** with `notInitialized` on both platforms. This is the parity
   I1 guard: without it the native Android SDK throws `IllegalStateException` and
   crashes the app instead of rejecting.
4. **`login('')`** — must reject with `invalidArgument`, not crash (parity I2).
5. **`requestPermission`** — grant it, then poll `getToken` until it resolves a
   token. There is no `onTokenUpdated` event in JS (see the root README's
   *Native methods deliberately not exported to JS*), so token delivery is
   pull-only: APNs hex on iOS, FCM token on Android.
6. **Send a push** and confirm `onNotificationReceived` in the foreground and
   `onNotificationOpened` on tap. Tapping while the app is backgrounded exercises
   the Android `onNewIntent` path the wrapper registers for you (parity A3).
7. **Event log** — the same events, in the same shape, on both architectures.
   That equivalence is the actual thing under test.

The API surface is identical on both builds by construction: one Codegen spec
generates the New Architecture contract, and the Old Architecture module is
checked against it in CI-by-eye (see the root README's note on that gap).

## Troubleshooting

**`[CXX1101] NDK at .../26.1.10909125 did not have a source.properties file`** —
that NDK is half-installed. The version comes from the React Native app template
(`android/build.gradle` → `ndkVersion`), not from this package, so you would hit it
in any RN 0.76 app. Either finish the install in Android Studio (SDK Manager →
SDK Tools → NDK) or point `ndkVersion` at a complete one you already have:

```sh
ls $ANDROID_HOME/ndk
```

**`Undefined symbols: __swift_FORCE_LOAD_$_swiftCompatibility56`** (iOS link) — the
app target has no Swift file, so Xcode omits the Swift runtime search paths. The
Podfile's `post_install` adds them; do not remove that block. Note it uses
`DT_TOOLCHAIN_DIR` — plain `TOOLCHAIN_DIR` resolves to the Metal toolchain under
Xcode 26 and silently points at a path that does not exist. See the root README's
iOS section for the alternative fix.

**`Could not find com.android.tools.build:gradle:`** (empty version) — the second
`includeBuild` at the bottom of `android/settings.gradle` is what supplies those
versions. Do not remove it.

**`Included build '.../node_modules/@react-native/gradle-plugin' does not exist`** —
something reverted `android/settings.gradle` to the stock template, which
hard-codes a path that does not exist in a workspace. It must resolve the plugin
through Node; see the comment in that file.

**Stale Codegen after switching architecture** — `cd android && ./gradlew clean`.
Gradle caches the generated `NativeAppsonairPushSpec`, and a switch without a
clean is the usual cause of "cannot find symbol".

## Known no-ops

Some buttons intentionally do nothing on one platform — that is the wrapper being
honest about the native SDKs rather than a bug:

| Button | Behaviour |
|---|---|
| `provisional auth (iOS)` | iOS only — resolves without effect on Android |
| `removeGroup (Android)` | Android only |
| `set(5)` / `increment()` (badge) | Best-effort on Android — launcher broadcasts, a silent no-op outside Samsung / MIUI / ASUS |
| `get` (badge) | Android returns the SDK's own persisted count, which can drift from the launcher |
| `preventDefault()` in `onNotificationWillDisplay` | Honoured on Android only; the event itself fires on both |

See the root README's *Platform differences* table for the full set.

> Both native SDKs are pre-release (`0.0.2-alpha`), but the backend is live: they
> register the device and sync subscription state — tags, language, opt-in — to
> `/v1/subscriptions`. Registration is testable end-to-end.
