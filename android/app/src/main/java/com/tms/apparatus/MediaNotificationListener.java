package com.tms.apparatus;

import android.service.notification.NotificationListenerService;

/**
 * Exists only so the user can grant "Notification access", which is what Android requires
 * before MediaSessionManager lists other apps' media sessions (title, artwork, progress).
 * Notifications themselves are never read.
 */
public class MediaNotificationListener extends NotificationListenerService {
}
