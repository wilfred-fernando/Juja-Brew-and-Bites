package com.jujabrewandbites.pos;

import android.content.Intent;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

@CapacitorPlugin(name = "CustomerOrderProgress")
public class CustomerOrderProgressPlugin extends Plugin {
    @Override public void load() { CustomerOrderNotifications.createChannels(getContext()); }

    @PluginMethod public void show(PluginCall call) {
        JSObject input = call.getObject("data", new JSObject());
        Map<String, String> data = new HashMap<>();
        Iterator<String> keys = input.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            data.put(key, input.optString(key, ""));
        }
        JSObject result = new JSObject();
        result.put("shown", CustomerOrderNotifications.show(getContext(), data));
        call.resolve(result);
    }

    @PluginMethod public void consumeOpenOrder(PluginCall call) {
        Intent intent = getActivity().getIntent();
        JSObject result = new JSObject();
        result.put("open", intent.getBooleanExtra("juja_order_open", false));
        intent.removeExtra("juja_order_open");
        call.resolve(result);
    }

    @PluginMethod public void openSettings(PluginCall call) {
        Intent intent = new Intent(Build.VERSION.SDK_INT >= 26
            ? Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS : Settings.ACTION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.putExtra(Settings.EXTRA_CHANNEL_ID, CustomerOrderNotifications.ALERT_CHANNEL);
        try { getActivity().startActivity(intent); call.resolve(); }
        catch (Exception error) { call.reject("Unable to open notification settings", error); }
    }
}
