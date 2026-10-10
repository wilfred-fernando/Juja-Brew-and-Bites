package com.jujabrewandbites.pos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CustomerOrderDismissReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        String orderId = intent.getStringExtra("web_order_id");
        if (orderId != null) CustomerOrderNotifications.dismiss(context, orderId);
    }
}
