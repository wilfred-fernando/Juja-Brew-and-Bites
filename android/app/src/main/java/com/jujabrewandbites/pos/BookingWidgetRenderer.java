package com.jujabrewandbites.pos;

import static com.jujabrewandbites.pos.BookingWidgetProvider.*;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Color;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Calendar;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

final class BookingWidgetRenderer {
    static int firstSundayOffset(Calendar month) { return month.get(Calendar.DAY_OF_WEEK)-Calendar.SUNDAY; }
    private static String status(JSONObject b) { return "pending".equals(b.optString("status")) ? "PENDING" : "CONFIRMED"; }
    private static RemoteViews card(Context c,JSONObject b,boolean compact,boolean showTime,boolean payment) {
        RemoteViews v=new RemoteViews(c.getPackageName(),res(c,"layout",compact ? "booking_widget_card_compact" : "booking_widget_booking"));
        boolean pending="PENDING".equals(status(b));
        v.setInt(res(c,"id","widget_booking"),"setBackgroundResource",res(c,"drawable",pending ? "booking_widget_pending" : "booking_widget_confirmed"));
        v.setTextViewText(res(c,"id","widget_name"),b.optString("customer_name","Booking"));
        v.setTextViewText(res(c,"id","widget_time"),format(instant(b.optString("start_at")),"h:mm a")+"–"+format(instant(b.optString("end_at")),"h:mm a"));
        v.setViewVisibility(res(c,"id","widget_time"),showTime?View.VISIBLE:View.GONE);
        if(!compact) {
            v.setTextViewText(res(c,"id","widget_status"),status(b));
            v.setTextColor(res(c,"id","widget_status"),Color.parseColor(pending?"#0369A1":"#047857"));
            v.setInt(res(c,"id","widget_status"),"setBackgroundColor",Color.parseColor(pending?"#BAE6FD":"#A7F3D0"));
            v.setTextViewText(res(c,"id","widget_package"),b.optString("package_name","Package "+b.optInt("package_id"))+" · "+b.optInt("guest_count")+" guests");
            v.setTextViewText(res(c,"id","widget_event"),b.optString("event_type","Event"));
            String p=b.optString("payment_status");
            v.setTextViewText(res(c,"id","widget_payment"),p.equals("approved")?"Payment approved":p.equals("waived")?"Reservation fee waived":"Payment pending");
            v.setViewVisibility(res(c,"id","widget_payment"),payment?View.VISIBLE:View.GONE);
            if(payment) {
                v.setTextViewTextSize(res(c,"id","widget_name"),android.util.TypedValue.COMPLEX_UNIT_SP,12);
                v.setTextViewTextSize(res(c,"id","widget_time"),android.util.TypedValue.COMPLEX_UNIT_SP,11);
                v.setTextViewTextSize(res(c,"id","widget_package"),android.util.TypedValue.COMPLEX_UNIT_SP,10);
                v.setTextViewTextSize(res(c,"id","widget_event"),android.util.TypedValue.COMPLEX_UNIT_SP,9);
                v.setTextViewTextSize(res(c,"id","widget_status"),android.util.TypedValue.COMPLEX_UNIT_SP,8);
            }
        }
        return v;
    }
    static void render(Context c,AppWidgetManager manager,int widget) {
        if(!BookingWidgetStore.isPos(c))return;
        try {
            long now=System.currentTimeMillis();String today=format(now,"yyyy-MM-dd");
            int offset=Math.max(0,Math.min(3,BookingWidgetStore.prefs(c).getInt("month:"+widget,0)));
            Calendar month=monthNow();month.add(Calendar.MONTH,offset);
            String prefix=format(month.getTimeInMillis(),"yyyy-MM"),selected=BookingWidgetStore.prefs(c).getString("day:"+widget,today);
            boolean dayMode=BookingWidgetStore.prefs(c).getBoolean("mode:"+widget,false);
            if(!dayMode && !selected.startsWith(prefix))selected=prefix+"-01";
            JSONObject state=BookingWidgetStore.read(c);boolean connected=!state.optString("token").isEmpty();
            JSONArray bookings=state.optJSONObject("payload")==null?new JSONArray():state.getJSONObject("payload").optJSONArray("bookings");
            if(bookings==null)bookings=new JSONArray();
            int confirmed=0,pending=0;
            for(int i=0;i<bookings.length();i++) {
                JSONObject b=bookings.getJSONObject(i);long end=instant(b.optString("end_at"));
                b.put("_end",end);b.put("_start_day",format(instant(b.optString("start_at")),"yyyy-MM-dd"));b.put("_end_day",format(end-1,"yyyy-MM-dd"));
                if(end>now && b.optString("business_date",b.optString("_start_day")).startsWith(prefix)) {
                    if("PENDING".equals(status(b)))pending++;else confirmed++;
                }
            }
            RemoteViews v=new RemoteViews(c.getPackageName(),res(c,"layout","booking_widget"));
            v.setTextViewText(res(c,"id","widget_month"),format(month.getTimeInMillis(),"MMMM yyyy"));
            v.setTextViewText(res(c,"id","widget_total"),"BOOKINGS "+(confirmed+pending));
            v.setTextViewText(res(c,"id","widget_confirmed"),"CONFIRMED "+confirmed);
            v.setTextViewText(res(c,"id","widget_pending"),"PENDING "+pending);
            v.setOnClickPendingIntent(res(c,"id","widget_title"),open(c));
            v.setOnClickPendingIntent(res(c,"id","widget_prev"),action(c,widget,"month",String.valueOf(Math.max(0,offset-1))));
            v.setOnClickPendingIntent(res(c,"id","widget_next"),action(c,widget,"month",String.valueOf(Math.min(3,offset+1))));
            v.setOnClickPendingIntent(res(c,"id","widget_today"),action(c,widget,"today","0"));
            v.setOnClickPendingIntent(res(c,"id","widget_refresh"),action(c,widget,"refresh","0"));
            v.setOnClickPendingIntent(res(c,"id","widget_back"),action(c,widget,"back","0"));
            v.setViewVisibility(res(c,"id","widget_month_view"),dayMode?View.GONE:View.VISIBLE);
            v.setViewVisibility(res(c,"id","widget_day_view"),dayMode?View.VISIBLE:View.GONE);
            v.removeAllViews(res(c,"id","widget_weekdays"));v.removeAllViews(res(c,"id","widget_days"));
            for(String name:new String[]{"SUN","MON","TUE","WED","THU","FRI","SAT"}) {
                RemoteViews cell=new RemoteViews(c.getPackageName(),res(c,"layout","booking_widget_day"));
                cell.setTextViewText(res(c,"id","widget_day"),name);v.addView(res(c,"id","widget_weekdays"),cell);
            }
            int height=manager.getAppWidgetOptions(widget).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,460);
            int width=manager.getAppWidgetOptions(widget).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,300);
            int rowHeight=Math.max(16,(height-166)/6);boolean full=width/7>=85 && rowHeight>=80;
            Calendar grid=(Calendar)month.clone();grid.add(Calendar.DAY_OF_MONTH,-firstSundayOffset(month));
            for(int row=0;row<6;row++) {
                RemoteViews week=new RemoteViews(c.getPackageName(),res(c,"layout","booking_widget_week"));
                for(int col=0;col<7;col++) {
                    String date=format(grid.getTimeInMillis(),"yyyy-MM-dd");boolean inMonth=date.startsWith(prefix);
                    RemoteViews cell=new RemoteViews(c.getPackageName(),res(c,"layout","booking_widget_cell"));
                    List<JSONObject> rows=forDay(bookings,date,now);int limit=full&&rowHeight>=150?2:1;
                    String label=String.valueOf(grid.get(Calendar.DAY_OF_MONTH));if(rows.size()>limit)label+=" · "+rows.size();
                    cell.setTextViewText(res(c,"id","widget_day"),label);
                    cell.setTextColor(res(c,"id","widget_day"),Color.parseColor(!inMonth?"#CBD5E1":date.equals(today)?"#047857":"#334155"));
                    cell.setInt(res(c,"id","widget_day_cell"),"setBackgroundResource",res(c,"drawable",!inMonth?"booking_widget_cell_muted":"booking_widget_cell"));
                    if(rowHeight<30 && !rows.isEmpty())cell.setInt(res(c,"id","widget_day_cell"),"setBackgroundResource",res(c,"drawable","PENDING".equals(status(rows.get(0)))?"booking_widget_pending":"booking_widget_confirmed"));
                    cell.setOnClickPendingIntent(res(c,"id","widget_day_cell"),action(c,widget,"day",date));
                    cell.setContentDescription(res(c,"id","widget_day_cell"),date+", "+rows.size()+" bookings");
                    if(rowHeight>=30)for(int n=0;n<Math.min(limit,rows.size());n++)cell.addView(res(c,"id","widget_cell_bookings"),card(c,rows.get(n),!full,rowHeight>=44,false));
                    week.addView(res(c,"id","widget_week"),cell);grid.add(Calendar.DAY_OF_MONTH,1);
                }
                v.addView(res(c,"id","widget_days"),week);
            }
            v.setTextViewText(res(c,"id","widget_selected"),selected+" · Philippine time");
            v.removeAllViews(res(c,"id","widget_bookings"));List<JSONObject> agenda=forDay(bookings,selected,now);
            int visible=Math.max(1,Math.min(6,(height-206)/88));
            v.setViewVisibility(res(c,"id","widget_empty"),!connected||!state.has("payload")||agenda.isEmpty()?View.VISIBLE:View.GONE);
            v.setTextViewText(res(c,"id","widget_empty"),!connected?"Open POS and sign in":!state.has("payload")?"Refreshing bookings…":"No upcoming bookings this day");
            v.setOnClickPendingIntent(res(c,"id","widget_empty"),open(c));
            for(int n=0;n<Math.min(visible,agenda.size());n++) {
                RemoteViews item=card(c,agenda.get(n),false,true,true);item.setOnClickPendingIntent(res(c,"id","widget_booking"),open(c));
                v.addView(res(c,"id","widget_bookings"),item);
            }
            long updated=state.optLong("updated");String footer=updated==0?"Open POS to connect · Philippine time":(now-updated>45*60000?"Saved schedule · ":"Updated ")+format(updated,"MMM d, h:mm a");
            if(dayMode&&agenda.size()>visible)footer="+"+(agenda.size()-visible)+" more in POS · "+footer;
            v.setTextViewText(res(c,"id","widget_updated"),footer);v.setOnClickPendingIntent(res(c,"id","widget_updated"),open(c));
            synchronized(BookingWidgetStore.class) {
                JSONObject current=BookingWidgetStore.read(c);
                if(!state.optString("token").equals(current.optString("token"))||state.optLong("updated")!=current.optLong("updated"))return;
                manager.updateAppWidget(widget,v);
            }
        }catch(Exception ignored){/* Retain the last successfully rendered calendar. */}
    }
}
