#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/**
 * ObjC++ half of the iOS bridge.
 *
 * The base class is the same on both architectures -- RCTEventEmitter, which
 * carries the ten AppsonairPush:* events. Only the adopted protocol differs:
 * the Codegen-generated NativeAppsonairPushSpec under the New Architecture, and
 * plain RCTBridgeModule under the Old one.
 *
 * That is the whole conditional. Because Codegen derives its ObjC selectors from
 * the same JS method names RCT_EXPORT_METHOD does, one method body in the .mm
 * satisfies both -- see the note there.
 */
#ifdef RCT_NEW_ARCH_ENABLED

#import <AppsonairReactNativePushSpec/AppsonairReactNativePushSpec.h>

@interface AppsonairReactNativePush : RCTEventEmitter <NativeAppsonairPushSpec>
@end

#else

@interface AppsonairReactNativePush : RCTEventEmitter <RCTBridgeModule>
@end

#endif
