# AppsOnAir Push — example app

A test harness for `appsonair-react-native-apppush`. Every button calls the public
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

By default this example resolves the **published** native SDKs (`1.0.0-beta`
on both platforms) — JitPack on Android, the CocoaPods trunk on iOS — so it
exercises exactly the dependency path a host app gets. Nothing extra to set
up.

Two things are checked in as **placeholders**, and the app will build but not
receive anything until you replace them with your own:

| Where | Placeholder | Replace with |
|---|---|---|
| `android/app/src/main/AndroidManifest.xml` | `AppsonairAppId` = `your-appsonair-app-id` | your AppsOnAir app id |
| `ios/AppsOnAirPushExample/Info.plist` | `AppsonairAppId` = `your-appsonair-app-id` | your AppsOnAir app id |

**Android also needs Firebase**, and no credentials ship with this repo. Create a
Firebase project, register an Android app with package name
`com.appsonairpushexample`, and drop the downloaded `google-services.json` into
`android/app/`. It is gitignored, so it stays yours.

Without it the app still builds — `app/build.gradle` applies the Google Services
plugin only when the file is present, and warns when it isn't — but
`initialize()` fails at runtime with *Default FirebaseApp is not initialized in
this process*, because the APK carries no sender id.

iOS uses APNs directly and needs no Firebase file at all. It does need the Push
Notifications capability on the target and a real `AppsonairAppId` in
`Info.plist`. Both targets use the `com.appsonairpushexample` bundle id, which
you will want to change to one your team can sign and enable push on.

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
`NativeAppsonairApppushSpec`" or a stale module:

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
Gradle caches the generated `NativeAppsonairApppushSpec`, and a switch without a
clean is the usual cause of "cannot find symbol".
