package com.jujabrewandbites.pos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ClassicBluetoothPrinterPlugin.class);
        if (getPackageName().endsWith(".customer")) registerPlugin(CustomerOrderProgressPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getBooleanExtra("juja_order_open", false) && getBridge() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.location.href='/customer?tab=history'", null));
        }
    }
}
