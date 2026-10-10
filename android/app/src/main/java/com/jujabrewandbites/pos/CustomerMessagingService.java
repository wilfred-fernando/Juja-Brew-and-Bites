package com.jujabrewandbites.pos;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.MessagingService;

public class CustomerMessagingService extends MessagingService {
    @Override public void onMessageReceived(@NonNull RemoteMessage message) {
        if ("1".equals(message.getData().get("order_progress"))) {
            CustomerOrderNotifications.show(this, message.getData());
            // Native service owns this message; don't create a second JS notification.
            return;
        }
        super.onMessageReceived(message);
    }
}
