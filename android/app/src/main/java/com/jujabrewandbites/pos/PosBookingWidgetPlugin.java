package com.jujabrewandbites.pos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name="PosBookingWidget")
public class PosBookingWidgetPlugin extends Plugin {
    @PluginMethod public void identity(PluginCall call) {
        if (!BookingWidgetStore.isPos(getContext())) { call.reject("POS installation required"); return; }
        JSObject result = new JSObject(); result.put("deviceId", BookingWidgetStore.identity(getContext()));
        result.put("connected", !BookingWidgetStore.read(getContext()).optString("token").isEmpty()); call.resolve(result);
    }
    @PluginMethod public void configure(PluginCall call) {
        String token = call.getString("token", "");
        if (!BookingWidgetStore.isPos(getContext()) || !token.matches("[A-Za-z0-9_-]{43}")) { call.reject("Invalid widget connection"); return; }
        try { BookingWidgetStore.configure(getContext(), token); BookingWidgetProvider.renderAll(getContext()); BookingWidgetJob.schedule(getContext(), true); call.resolve(); }
        catch (Exception error) { call.reject("Widget connection unavailable", error); }
    }
    @PluginMethod public void refresh(PluginCall call) { BookingWidgetJob.schedule(getContext(), true); call.resolve(); }
    @PluginMethod public void clear(PluginCall call) {
        String token = BookingWidgetStore.clear(getContext()); BookingWidgetJob.cancel(getContext()); BookingWidgetProvider.renderAll(getContext());
        if (!token.isEmpty()) new Thread(() -> { try { BookingWidgetStore.request(getContext(), token, true); } catch (Exception ignored) {} }, "widget-revoke").start();
        call.resolve();
    }
}
