#import "AppsonairReactNativePush.h"

// The Swift half. Under CocoaPods the pod's module name is pinned to
// AppsonairReactNativePush in the podspec, so this header name is stable; the
// bracket form is the fallback for build setups that expose it as a framework.
#if __has_include("AppsonairReactNativePush-Swift.h")
#import "AppsonairReactNativePush-Swift.h"
#else
#import <AppsonairReactNativePush/AppsonairReactNativePush-Swift.h>
#endif

/**
 * Every method below is written once and serves both architectures.
 *
 * RCT_EXPORT_METHOD builds the selector from the JS method name and the argument
 * labels, which is exactly how Codegen derives the NativeAppsonairPushSpec
 * protocol selectors. So `RCT_EXPORT_METHOD(login:(NSString *)externalId
 * resolve:...)` produces `login:resolve:reject:` -- the same selector the
 * protocol declares. Under the New Architecture the implementation satisfies the
 * protocol; under the Old one the macro registers it with the bridge. Neither
 * path needs a second body.
 *
 * The one thing that must hold for this to keep working: argument labels here
 * have to match the parameter names in src/NativeAppsonairPush.ts exactly. A
 * rename on either side silently breaks the New Architecture build.
 */
@implementation AppsonairReactNativePush {
  AppsonairReactNativePushImpl *_impl;
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE()

- (instancetype)init
{
  if (self = [super init]) {
    _impl = [AppsonairReactNativePushImpl new];

    // Events raised before JS subscribes would trip RCTEventEmitter's
    // "sending event with no listeners" warning, so they are dropped here rather
    // than queued -- a token or permission change that arrives before the first
    // listener is re-readable through the corresponding getter.
    __weak __typeof(self) weakSelf = self;
    _impl.eventSink = ^(NSString *name, NSDictionary *body) {
      __strong __typeof(weakSelf) strongSelf = weakSelf;
      if (strongSelf && strongSelf->_hasListeners) {
        [strongSelf sendEventWithName:name body:body];
      }
    };
  }
  return self;
}

/// The SDK is @MainActor-isolated and its initialize() touches UIKit, so the
/// module must be constructed on the main queue.
+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    @"AppsonairPush:onTokenUpdated",
    @"AppsonairPush:onNotificationReceived",
    @"AppsonairPush:onNotificationOpened",
    @"AppsonairPush:onNotificationWillDisplay",
    @"AppsonairPush:onPermissionChanged",
    @"AppsonairPush:onSubscriptionChanged",
    @"AppsonairPush:onUserStateChanged",
    @"AppsonairPush:onSilentNotification",
    // Declared but never emitted here: the Firebase Installation ID is an Android
    // concept (parity B2). The list is kept identical to Android's so the two
    // bridges stay diffable; RCTEventEmitter does not mind an unused entry.
    @"AppsonairPush:onInstallationIdUpdated",
    @"AppsonairPush:onError"
  ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

#pragma mark - Lifecycle

RCT_EXPORT_METHOD(initialize:(NSDictionary *)config
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl initialize:config resolve:resolve reject:reject];
}

#pragma mark - Identity

RCT_EXPORT_METHOD(getDeviceId:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getDeviceId:resolve reject:reject];
}

RCT_EXPORT_METHOD(getSubscriptionId:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getSubscriptionId:resolve reject:reject];
}

RCT_EXPORT_METHOD(setSubscriptionId:(NSString *)id
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setSubscriptionId:id resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getExternalId:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getExternalId:resolve reject:reject];
}

RCT_EXPORT_METHOD(login:(NSString *)externalId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl login:externalId resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(logout:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl logout:resolve reject:reject];
}

#pragma mark - Token

RCT_EXPORT_METHOD(getToken:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getToken:resolve reject:reject];
}

RCT_EXPORT_METHOD(refreshToken:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl refreshToken:resolve reject:reject];
}

RCT_EXPORT_METHOD(getInstallationId:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getInstallationId:resolve reject:reject];
}

RCT_EXPORT_METHOD(getApnsEnvironment:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getApnsEnvironment:resolve reject:reject];
}

#pragma mark - Permissions

RCT_EXPORT_METHOD(requestPermission:(BOOL)fallbackToSettings
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl requestPermission:fallbackToSettings resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getPermission:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getPermission:resolve reject:reject];
}

RCT_EXPORT_METHOD(getPermissionStatus:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getPermissionStatus:resolve reject:reject];
}

RCT_EXPORT_METHOD(canRequestPermission:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl canRequestPermission:resolve reject:reject];
}

RCT_EXPORT_METHOD(registerForProvisionalAuthorization:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl registerForProvisionalAuthorization:resolve reject:reject];
}

#pragma mark - Notifications

RCT_EXPORT_METHOD(clearAllNotifications:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl clearAllNotifications:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeNotification:(NSString *)notificationId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeNotification:notificationId resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeNotifications:(NSArray *)notificationIds
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeNotifications:notificationIds resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeNotificationGroup:(NSString *)groupKey
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeNotificationGroup:groupKey resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(createNotificationChannel:(NSDictionary *)config
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl createNotificationChannel:config resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(deleteNotificationChannel:(NSString *)channelId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl deleteNotificationChannel:channelId resolve:resolve reject:reject];
}

#pragma mark - Badges

RCT_EXPORT_METHOD(getBadgeCount:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getBadgeCount:resolve reject:reject];
}

RCT_EXPORT_METHOD(setBadgeCount:(double)count
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setBadgeCount:count resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(incrementBadgeCount:(double)delta
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl incrementBadgeCount:delta resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(clearBadgeCount:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl clearBadgeCount:resolve reject:reject];
}

RCT_EXPORT_METHOD(setAutoClearBadgeOnForeground:(BOOL)enabled
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setAutoClearBadgeOnForeground:enabled resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(setAutoRegisterForRemoteNotifications:(BOOL)enabled
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setAutoRegisterForRemoteNotifications:enabled resolve:resolve reject:reject];
}

#pragma mark - User

RCT_EXPORT_METHOD(addTag:(NSString *)key
                  value:(NSString *)value
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl addTag:key value:value resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(addTags:(NSDictionary *)tags
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl addTags:tags resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeTag:(NSString *)key
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeTag:key resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeTags:(NSArray *)keys
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeTags:keys resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getTags:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getTags:resolve reject:reject];
}

RCT_EXPORT_METHOD(addAlias:(NSString *)label
                  id:(NSString *)id
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl addAlias:label id:id resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(addAliases:(NSDictionary *)aliases
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl addAliases:aliases resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeAlias:(NSString *)label
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeAlias:label resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeAliases:(NSArray *)labels
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeAliases:labels resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(addEmail:(NSString *)address
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl addEmail:address resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(removeEmail:(NSString *)address
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl removeEmail:address resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(setLanguage:(NSString *)languageCode
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setLanguage:languageCode resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getLanguage:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getLanguage:resolve reject:reject];
}

RCT_EXPORT_METHOD(getPushSubscription:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getPushSubscription:resolve reject:reject];
}

RCT_EXPORT_METHOD(optIn:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl optIn:resolve reject:reject];
}

RCT_EXPORT_METHOD(optOut:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl optOut:resolve reject:reject];
}

RCT_EXPORT_METHOD(getOptedIn:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getOptedIn:resolve reject:reject];
}

#pragma mark - Consent

RCT_EXPORT_METHOD(setConsentRequired:(BOOL)required
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setConsentRequired:required resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getConsentRequired:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getConsentRequired:resolve reject:reject];
}

RCT_EXPORT_METHOD(setConsentGiven:(BOOL)given
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setConsentGiven:given resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(getConsentGiven:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl getConsentGiven:resolve reject:reject];
}

#pragma mark - Test device

RCT_EXPORT_METHOD(setTestDevice:(BOOL)enabled
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setTestDevice:enabled resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(isTestDevice:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl isTestDevice:resolve reject:reject];
}

#pragma mark - Background sync

RCT_EXPORT_METHOD(scheduleBackgroundSync:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl scheduleBackgroundSync:options resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(cancelBackgroundSync:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl cancelBackgroundSync:resolve reject:reject];
}

#pragma mark - Debug

RCT_EXPORT_METHOD(setLogLevel:(NSString *)level
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl setLogLevel:level resolve:resolve reject:reject];
}

#pragma mark - Foreground display control

RCT_EXPORT_METHOD(completeNotificationWillDisplay:(NSString *)notificationId
                  display:(BOOL)display
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  [_impl completeNotificationWillDisplay:notificationId
                                display:display
                                resolve:resolve
                                 reject:reject];
}

#pragma mark - TurboModule

// addListener: / removeListeners: are inherited from RCTEventEmitter, whose
// signatures already match the ones Codegen declares on the spec protocol, so
// there is nothing to add for them here.

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppsonairPushSpecJSI>(params);
}
#endif

@end
