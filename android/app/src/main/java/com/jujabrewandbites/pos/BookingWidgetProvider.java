package com.jujabrewandbites.pos;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

public class BookingWidgetProvider extends AppWidgetProvider {
    static final String ACTION = "com.jujabrewandbites.pos.BOOKING_WIDGET";
    static final TimeZone ZONE = TimeZone.getTimeZone("Asia/Manila");
    static int res(Context c, String type, String name) { return c.getResources().getIdentifier(name, type, c.getPackageName()); }
    static String format(long time, String pattern) { SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.ENGLISH); f.setTimeZone(ZONE); return f.format(new Date(time)); }
    static long instant(String value) {
        try { return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.ENGLISH).parse(value.replaceAll("\\.\\d+(?=[Z+-])", "")).getTime(); }
        catch (Exception ignored) { return 0; }
    }
    static Calendar monthNow() { Calendar c = Calendar.getInstance(ZONE); c.set(Calendar.DAY_OF_MONTH, 1); c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0); return c; }
    static List<JSONObject> forDay(JSONArray bookings, String day, long now) {
        List<JSONObject> rows = new ArrayList<>();
        for (int i = 0; i < bookings.length(); i++) {
            JSONObject b = bookings.optJSONObject(i); if (b == null) continue;
            if (b.has("business_date")) {
                if (instant(b.optString("end_at"))>now && day.equals(b.optString("business_date"))) rows.add(b);
                continue;
            }
            long end = b.has("_end") ? b.optLong("_end") : instant(b.optString("end_at"));
            String startDay = b.has("_start_day") ? b.optString("_start_day") : format(instant(b.optString("start_at")),"yyyy-MM-dd");
            String endDay = b.has("_end_day") ? b.optString("_end_day") : format(end-1,"yyyy-MM-dd");
            if (end > now && startDay.compareTo(day) <= 0 && endDay.compareTo(day) >= 0) rows.add(b);
        }
        return rows;
    }
    static PendingIntent action(Context c, int widget, String action, String value) {
        Intent intent = new Intent(c, BookingWidgetProvider.class).setAction(ACTION)
            .setData(Uri.parse("juja-widget://" + widget + "/" + action + "/" + value))
            .putExtra("widget", widget).putExtra("operation", action).putExtra("value", value);
        return PendingIntent.getBroadcast(c, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static PendingIntent open(Context c) {
        Intent intent = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 21080, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static void renderAll(Context c) {
        if (!BookingWidgetStore.isPos(c)) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(c);
        for (int id : manager.getAppWidgetIds(new ComponentName(c, BookingWidgetProvider.class))) render(c, manager, id);
    }
    static void render(Context c, AppWidgetManager manager, int widget) { BookingWidgetRenderer.render(c,manager,widget); }
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id:ids) render(c,m,id); BookingWidgetJob.schedule(c,true); }
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options) { render(c,m,id); }
    @Override public void onDisabled(Context c) { BookingWidgetJob.cancel(c); }
    @Override public void onDeleted(Context c,int[] ids) { for(int id:ids) BookingWidgetStore.prefs(c).edit().remove("month:"+id).remove("day:"+id).remove("mode:"+id).apply(); }
    @Override public void onReceive(Context c,Intent intent) {
        super.onReceive(c,intent); if (!ACTION.equals(intent.getAction()) || !BookingWidgetStore.isPos(c)) return;
        int widget = intent.getIntExtra("widget",-1); if(widget<0) return;
        String op=intent.getStringExtra("operation"), value=intent.getStringExtra("value");
        if ("month".equals(op)) { int n; try { n=Integer.parseInt(value); } catch(Exception ignored){return;} BookingWidgetStore.prefs(c).edit().putInt("month:"+widget,Math.max(0,Math.min(3,n))).remove("day:"+widget).remove("mode:"+widget).apply(); }
        if ("day".equals(op) && value!=null && value.matches("\\d{4}-\\d{2}-\\d{2}")) BookingWidgetStore.prefs(c).edit().putString("day:"+widget,value).putBoolean("mode:"+widget,true).apply();
        if ("back".equals(op)) BookingWidgetStore.prefs(c).edit().remove("mode:"+widget).apply();
        if ("today".equals(op)) BookingWidgetStore.prefs(c).edit().remove("month:"+widget).remove("day:"+widget).remove("mode:"+widget).apply();
        if ("refresh".equals(op)) BookingWidgetJob.schedule(c,true);
        render(c,AppWidgetManager.getInstance(c),widget);
    }
}
