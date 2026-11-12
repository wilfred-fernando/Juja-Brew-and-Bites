package com.jujabrewandbites.pos;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.RemoteViews;
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
    static void render(Context c, AppWidgetManager manager, int widget) {
        if (!BookingWidgetStore.isPos(c)) return;
        try {
            long now = System.currentTimeMillis(); String today = format(now, "yyyy-MM-dd");
            Calendar month = monthNow(); int offset = Math.max(0, Math.min(3, BookingWidgetStore.prefs(c).getInt("month:" + widget, 0))); month.add(Calendar.MONTH, offset);
            String selected = BookingWidgetStore.prefs(c).getString("day:" + widget, offset == 0 ? today : format(month.getTimeInMillis(), "yyyy-MM-dd"));
            if (!selected.startsWith(format(month.getTimeInMillis(), "yyyy-MM"))) selected = format(month.getTimeInMillis(), "yyyy-MM-dd");
            JSONObject state = BookingWidgetStore.read(c); boolean connected = !state.optString("token").isEmpty();
            JSONArray bookings = state.optJSONObject("payload") == null ? new JSONArray() : state.getJSONObject("payload").optJSONArray("bookings");
            if (bookings == null) bookings = new JSONArray();
            for (int i=0;i<bookings.length();i++) {
                JSONObject b=bookings.optJSONObject(i); if(b==null) continue;
                long end=instant(b.optString("end_at")); b.put("_end",end);
                b.put("_start_day",format(instant(b.optString("start_at")),"yyyy-MM-dd")); b.put("_end_day",format(end-1,"yyyy-MM-dd"));
            }
            RemoteViews view = new RemoteViews(c.getPackageName(), res(c, "layout", "booking_widget"));
            view.setTextViewText(res(c,"id","widget_month"), format(month.getTimeInMillis(), "MMMM yyyy"));
            view.setOnClickPendingIntent(res(c,"id","widget_title"), open(c));
            view.setOnClickPendingIntent(res(c,"id","widget_prev"), action(c,widget,"month",String.valueOf(Math.max(0,offset-1))));
            view.setOnClickPendingIntent(res(c,"id","widget_next"), action(c,widget,"month",String.valueOf(Math.min(3,offset+1))));
            view.setOnClickPendingIntent(res(c,"id","widget_today"), action(c,widget,"today","0"));
            view.setOnClickPendingIntent(res(c,"id","widget_refresh"), action(c,widget,"refresh","0"));
            view.removeAllViews(res(c,"id","widget_days"));
            view.removeAllViews(res(c,"id","widget_weekdays"));
            for (String name : new String[]{"S","M","T","W","T","F","S"}) {
                RemoteViews cell = new RemoteViews(c.getPackageName(),res(c,"layout","booking_widget_day"));
                cell.setTextViewText(res(c,"id","widget_day"),name); cell.setTextColor(res(c,"id","widget_day"),Color.rgb(100,116,139));
                view.addView(res(c,"id","widget_weekdays"),cell);
            }
            int first = month.get(Calendar.DAY_OF_WEEK)-1, days = month.getActualMaximum(Calendar.DAY_OF_MONTH);
            for (int row = 0; row < (first+days+6)/7; row++) {
                RemoteViews week = new RemoteViews(c.getPackageName(), res(c,"layout","booking_widget_week"));
                for (int col = 0; col < 7; col++) {
                    int day = row*7+col-first+1; RemoteViews cell = new RemoteViews(c.getPackageName(), res(c,"layout","booking_widget_day"));
                    int text = res(c,"id","widget_day"); String label = "";
                    if (day >= 1 && day <= days) {
                        String iso = format(month.getTimeInMillis(),"yyyy-MM-") + String.format(Locale.US,"%02d",day);
                        int count = forDay(bookings,iso,now).size();
                        label = day + (count == 0 ? "" : " •");
                        boolean chosen = iso.equals(selected);
                        cell.setTextColor(text, chosen ? Color.WHITE : iso.equals(today) ? Color.rgb(149,88,22) : Color.rgb(20,42,62));
                        cell.setInt(text,"setBackgroundColor",chosen ? Color.rgb(11,105,66) : Color.TRANSPARENT);
                        cell.setOnClickPendingIntent(text, action(c,widget,"day",iso));
                        cell.setContentDescription(text,iso+", "+count+" upcoming bookings");
                    }
                    cell.setTextViewText(text,label); week.addView(res(c,"id","widget_week"),cell);
                }
                view.addView(res(c,"id","widget_days"),week);
            }
            view.setTextViewText(res(c,"id","widget_selected"),selected + " · Philippine time");
            view.removeAllViews(res(c,"id","widget_bookings"));
            List<JSONObject> agenda = forDay(bookings, selected, now);
            int height = manager.getAppWidgetOptions(widget).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,360);
            int limit = Math.max(1, Math.min(4,(height-270)/38));
            if (!connected || !state.has("payload") || agenda.isEmpty()) {
                RemoteViews item = new RemoteViews(c.getPackageName(),res(c,"layout","booking_widget_booking"));
                item.setTextViewText(res(c,"id","widget_name"),!connected ? "Open POS and sign in" : !state.has("payload") ? "Refreshing bookings…" : "No upcoming bookings this day");
                item.setTextViewText(res(c,"id","widget_time"),"Tap to open JUJA POS"); item.setOnClickPendingIntent(res(c,"id","widget_booking"),open(c));
                view.addView(res(c,"id","widget_bookings"),item);
            } else for (int i = 0; i < Math.min(limit,agenda.size()); i++) {
                JSONObject b = agenda.get(i); RemoteViews item = new RemoteViews(c.getPackageName(),res(c,"layout","booking_widget_booking"));
                item.setTextViewText(res(c,"id","widget_name"),b.optString("customer_name","Booking"));
                String payment = b.optString("payment_status"); payment = payment.equals("approved") ? "Paid" : payment.equals("waived") ? "Waived" : "Payment pending";
                item.setTextViewText(res(c,"id","widget_time"),format(instant(b.optString("start_at")),"h:mm a")+" – "+format(instant(b.optString("end_at")),"h:mm a")+" · "+payment);
                item.setOnClickPendingIntent(res(c,"id","widget_booking"),open(c)); view.addView(res(c,"id","widget_bookings"),item);
            }
            long updated = state.optLong("updated");
            String footer = updated == 0 ? "Sign in to POS to connect the calendar" : (now-updated>45*60000 ? "Saved schedule · " : "Updated ")+format(updated,"MMM d, h:mm a");
            if (agenda.size()>limit) footer = "+"+(agenda.size()-limit)+" more · "+footer;
            view.setTextViewText(res(c,"id","widget_updated"),footer); view.setOnClickPendingIntent(res(c,"id","widget_updated"),open(c));
            synchronized (BookingWidgetStore.class) {
                JSONObject current=BookingWidgetStore.read(c);
                if (!state.optString("token").equals(current.optString("token")) || state.optLong("updated")!=current.optLong("updated")) return;
                manager.updateAppWidget(widget,view);
            }
        } catch (Exception ignored) { /* Keep the last successfully rendered widget. */ }
    }
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { for (int id:ids) render(c,m,id); BookingWidgetJob.schedule(c,true); }
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager m,int id,Bundle options) { render(c,m,id); }
    @Override public void onDisabled(Context c) { BookingWidgetJob.cancel(c); }
    @Override public void onDeleted(Context c,int[] ids) { for(int id:ids) BookingWidgetStore.prefs(c).edit().remove("month:"+id).remove("day:"+id).apply(); }
    @Override public void onReceive(Context c,Intent intent) {
        super.onReceive(c,intent); if (!ACTION.equals(intent.getAction()) || !BookingWidgetStore.isPos(c)) return;
        int widget = intent.getIntExtra("widget",-1); if(widget<0) return;
        String op=intent.getStringExtra("operation"), value=intent.getStringExtra("value");
        if ("month".equals(op)) { int n; try { n=Integer.parseInt(value); } catch(Exception ignored){return;} BookingWidgetStore.prefs(c).edit().putInt("month:"+widget,Math.max(0,Math.min(3,n))).remove("day:"+widget).apply(); }
        if ("day".equals(op) && value!=null && value.matches("\\d{4}-\\d{2}-\\d{2}")) BookingWidgetStore.prefs(c).edit().putString("day:"+widget,value).apply();
        if ("today".equals(op)) BookingWidgetStore.prefs(c).edit().remove("month:"+widget).remove("day:"+widget).apply();
        if ("refresh".equals(op)) BookingWidgetJob.schedule(c,true);
        render(c,AppWidgetManager.getInstance(c),widget);
    }
}
