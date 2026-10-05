import AppsOnAir_AppPush_ServiceExt

// Downloads rich media and reports the "delivered" receipt for pushes that
// arrive while the app is in the background or killed -- the app itself does
// not run then, so this extension is the only place delivery can be recorded.
class NotificationService: AppsOnAirNotificationServiceExtension {}
