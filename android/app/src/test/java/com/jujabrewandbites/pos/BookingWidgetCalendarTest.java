package com.jujabrewandbites.pos;
import org.junit.Test;
import static org.junit.Assert.*;

public class BookingWidgetCalendarTest {
    @Test public void monthGridStartsOnSunday() {
        java.util.Calendar c=BookingWidgetProvider.monthNow();
        c.set(2026,java.util.Calendar.NOVEMBER,1);assertEquals(0,BookingWidgetRenderer.firstSundayOffset(c));
        c.set(2026,java.util.Calendar.DECEMBER,1);assertEquals(2,BookingWidgetRenderer.firstSundayOffset(c));
        c.set(2028,java.util.Calendar.FEBRUARY,1);assertEquals(2,BookingWidgetRenderer.firstSundayOffset(c));
        assertEquals(29,c.getActualMaximum(java.util.Calendar.DAY_OF_MONTH));
    }
    @Test public void manilaDatesAndOvernightTimes() {
        assertEquals("2026-12-01", BookingWidgetProvider.format(BookingWidgetProvider.instant("2026-11-30T16:00:00.000000+00:00"),"yyyy-MM-dd"));
        assertEquals("2026-12-01", BookingWidgetProvider.format(BookingWidgetProvider.instant("2026-12-01T03:00:00+08:00"),"yyyy-MM-dd"));
        assertEquals("3:00 AM", BookingWidgetProvider.format(BookingWidgetProvider.instant("2026-12-01T03:00:00+08:00"),"h:mm a"));
        assertEquals("2027-01-01", BookingWidgetProvider.format(BookingWidgetProvider.instant("2026-12-31T16:00:00Z"),"yyyy-MM-dd"));
        assertEquals(0, BookingWidgetProvider.instant("invalid"));
    }
}
