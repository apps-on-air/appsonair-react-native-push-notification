/**
 * Stands in for the native module so the real src/index.tsx can be exercised
 * under Jest.
 *
 * The library resolves the native module through TurboModuleRegistry first and
 * NativeModules second, and hands the latter to NativeEventEmitter -- which
 * throws on a null argument on iOS. Both are served the same object here, so the
 * module resolves exactly the way it does on a device.
 *
 * This runs as `setupFilesAfterEnv` rather than `setupFiles`: the React Native
 * preset owns `setupFiles`, and setting that key in jest.config.js replaces the
 * preset's list instead of extending it, which breaks React Native's own mocks.
 */
const {NativeModules, TurboModuleRegistry} = require('react-native');

const nativeModule = new Proxy(
  {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop];
      }
      // Every bridge method is promise-returning; `undefined` satisfies the
      // nullable-string returns and is ignored by the void ones.
      return (target[prop] = jest.fn(() => Promise.resolve(undefined)));
    },
  },
);

NativeModules.AppsonairReactNativePush = nativeModule;
jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(nativeModule);
