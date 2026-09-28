package com.tms.apparatus;

import android.service.notification.NotificationListenerService;

/**
 * Empty listener. Android only exposes other apps' media sessions
 * (MediaSessionManager.getActiveSessions) to apps holding an enabled
 * notification listener, so this service exists purely to hold that grant.
 */
public class MediaNotificationListener extends NotificationListenerService {
}
