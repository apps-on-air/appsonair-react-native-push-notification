#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/**
 * ObjC++ half of the iOS bridge. Only the protocol differs between architectures:
 * the Codegen spec on the New Architecture, RCTBridgeModule on the Old.
 */
#ifdef RCT_NEW_ARCH_ENABLED

#import <AppsonairReactNativeApppushSpec/AppsonairReactNativeApppushSpec.h>

@interface AppsonairReactNativeApppush : RCTEventEmitter <NativeAppsonairApppushSpec>
@end

#else

@interface AppsonairReactNativeApppush : RCTEventEmitter <RCTBridgeModule>
@end

#endif
