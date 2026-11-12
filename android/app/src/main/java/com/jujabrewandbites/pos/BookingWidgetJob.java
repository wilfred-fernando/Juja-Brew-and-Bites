package com.jujabrewandbites.pos;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.app.job.JobParameters;
import android.content.ComponentName;
import android.content.Context;

public class BookingWidgetJob extends JobService {
    private static final int PERIODIC = 21081, IMMEDIATE = 21082;
    static void schedule(Context c, boolean immediate) {
        if (!BookingWidgetStore.isPos(c) || BookingWidgetStore.read(c).optString("token").isEmpty()) return;
        if (android.appwidget.AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c,BookingWidgetProvider.class)).length == 0) return;
        JobScheduler scheduler = c.getSystemService(JobScheduler.class);
        ComponentName component = new ComponentName(c, BookingWidgetJob.class);
        if (scheduler.getPendingJob(PERIODIC) == null) scheduler.schedule(new JobInfo.Builder(PERIODIC, component)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(30 * 60 * 1000L).build());
        if (immediate && scheduler.getPendingJob(IMMEDIATE) == null) scheduler.schedule(new JobInfo.Builder(IMMEDIATE, component)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setMinimumLatency(0).build());
    }
    static void cancel(Context c) { JobScheduler s = c.getSystemService(JobScheduler.class); s.cancel(PERIODIC); s.cancel(IMMEDIATE); }
    @Override public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            boolean retry = false;
            try { String token = BookingWidgetStore.read(this).optString("token"); if (!token.isEmpty()) BookingWidgetStore.request(this, token, false); }
            catch (Exception ignored) { retry = true; }
            BookingWidgetProvider.renderAll(this); jobFinished(params, retry);
        }, "booking-widget-refresh").start();
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { return true; }
}
