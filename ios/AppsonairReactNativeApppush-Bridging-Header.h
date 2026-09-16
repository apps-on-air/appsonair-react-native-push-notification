// Makes the React promise block typedefs and RCTEventEmitter visible to
// AppsonairReactNativeApppushImpl.swift, which uses RCTPromiseResolveBlock and
// RCTPromiseRejectBlock in every exported method signature.
//
// Under CocoaPods this is reached through the pod's generated umbrella header
// rather than as a true Swift bridging header (CocoaPods never sets
// SWIFT_OBJC_BRIDGING_HEADER); the `#if canImport(React)` guard in the Swift
// file is the second path in. Keeping both is what the sibling AppRemark and
// AppSync wrappers do, and for the same reason.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
