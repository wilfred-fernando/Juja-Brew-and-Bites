"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/dateFormat";

const supabase = getSupabaseClient();

/* =======================
 Business Rules / Config
======================= */
const OPERATING_START_HOUR = 10; // 10AM
const BUFFER_HOURS = 1; // 1 hour buffer before & after
const MAX_EXTENSION_HOURS = 2; // extension max 2 hours
const MIN_ADVANCE_HOURS = 3; // must be at least 3 hours in advance
const RESCHEDULE_MIN_DAYS = 2; // update/reschedule allowed only if >= 2 days before start

// ✅ NEW BASE DURATION: 2 hours 59 minutes
const BASE_BOOKING_MINUTES = 2 * 60 + 59; // 179 mins

const DEPOSIT_AMOUNT = 1000;
const QR_IMAGE_PATH = "/images/qrph.jpg";
const ADMIN_EMAIL = "jujabrewandbites@gmail.com";

/* =====================================================
 Cleaner: Strip citations + OneDrive/SharePoint URLs
===================================================== */
function stripCitationsAndLinks(text = "") {
  return String(text || "")
    .replace(/\[\d+\]\((https?:\/\/[^)]+)\)/g, "")
    .replace(
      /https?:\/\/(?:1drv\.ms|onedrive\.live\.com|my\.sharepoint\.com|[^/\s]+sharepoint\.com)\S*/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* =====================================================
 PACKAGE POLICIES (1–6)
===================================================== */
const PACKAGE_POLICIES = {
  1: {
    id: 1,
    name: "Package 1",
    rental_fee: 3000,
    capacity: 15,
    room_usage: {
      capacity:
        "Capacity: up to 15 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱300 worth of food & drinks per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours:", "₱250 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱3,000 for 3 hours.",
      package_includes: [
        "₱2,500 worth of food & drinks (customizable selection).",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: 2500,
      room_rental_only: false,
    },
    food_beverages: {
      policy: "Outside food and beverages are subject to corkage fees:",
      corkage: [
        "Alcoholic drinks: ₱250",
        "Cakes & Lechon: FREE",
        "Other food items: ₱200 per dish",
      ],
      notes: "Customized menus and special requests must be arranged in advance.",
    },
  },
  2: {
    id: 2,
    name: "Package 2",
    rental_fee: 7000,
    capacity: 30,
    room_usage: {
      capacity:
        "Capacity: up to 30 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱300 worth of food & drinks per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours:", "₱750 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱7,000 for 3 hours.",
      package_includes: [
        "₱5,500 worth of food & drinks (customizable selection).",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: 5500,
      room_rental_only: false,
    },
    food_beverages: {
      policy: "Outside food and beverages are subject to corkage fees:",
      corkage: [
        "Alcoholic drinks: ₱500",
        "Cakes & Lechon: FREE",
        "Other food items: ₱200 per dish",
      ],
      notes: "Customized menus and special requests must be arranged in advance.",
    },
  },
  3: {
    id: 3,
    name: "Package 3",
    rental_fee: 15000,
    capacity: 60,
    room_usage: {
      capacity:
        "Capacity: up to 60 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱300 worth of food & drinks per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours:", "₱1,500 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱15,000 for 3 hours.",
      package_includes: [
        "₱12,000 worth of food & drinks (customizable selection).",
        "The entire store will be exclusively reserved for your event during the booking.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: 12000,
      room_rental_only: false,
    },
    food_beverages: {
      policy: "Outside food and beverages are subject to corkage fees:",
      corkage: [
        "Alcoholic drinks: ₱1,000",
        "Cakes & Lechon: FREE",
        "Other food items: ₱200 per dish",
      ],
      notes: "Customized menus and special requests must be arranged in advance.",
    },
  },
  4: {
    id: 4,
    name: "Package 4",
    rental_fee: 2500,
    capacity: 15,
    room_usage: {
      capacity:
        "Capacity: up to 15 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱150 per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours: ₱1,000 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱2,500 for 3 hours.",
      package_includes: [
        "Inclusive of corkage for food and drinks.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: null,
      room_rental_only: true,
    },
    food_beverages: {
      policy: "Outside food and beverages are allowed.",
      corkage: [],
      notes: "Additional setup time must be requested during booking (if needed).",
    },
  },
  5: {
    id: 5,
    name: "Package 5",
    rental_fee: 3500,
    capacity: 30,
    room_usage: {
      capacity:
        "Capacity: up to 30 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests:
        "Additional guests: ₱150 per person (maximum of 5 additional guests).",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours: ₱1,500 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱3,500 for 3 hours.",
      package_includes: [
        "Inclusive of corkage for food and drinks.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: null,
      room_rental_only: true,
    },
    food_beverages: {
      policy: "Outside food and beverages are allowed.",
      corkage: [],
      notes: "Additional setup time must be requested during booking (if needed).",
    },
  },
  6: {
    id: 6,
    name: "Package 6",
    rental_fee: 8000,
    capacity: 60,
    room_usage: {
      capacity:
        "Capacity: up to 60 Guests (children aged 4 years and below are not counted in the headcount).",
      additional_guests: "Additional guests: FREE.",
      rental_duration: "Rental duration: 3 hours.",
      extension: ["Extension maximum of 2 hours: ₱2,500 per hour."],
    },
    rental_fees_inclusions: {
      rental_fee: "Standard rental fee: ₱8,000 for 3 hours.",
      package_includes: [
        "Inclusive of corkage for food and drinks.",
        "The entire store will be exclusively reserved for your event during the booking.",
        "Use of entertainment amenities: Videoke, YouTube & Netflix.",
        "Fully air-conditioned private room.",
        "High-speed WiFi access.",
      ],
      consumable_amount: null,
      room_rental_only: true,
    },
    food_beverages: {
      policy: "Outside food and beverages are allowed.",
      corkage: [],
      notes: "Additional setup time must be requested during booking (if needed).",
    },
  },
};

/* =======================
 Helpers
======================= */
function formatPeso(n) {
  return `₱${Number(n).toLocaleString()}`;
}
function toISODate(d) {
  return d.toISOString().split("T")[0];
}
function buildSlotHours() {
  const hours = [];
  for (let h = OPERATING_START_HOUR; h <= 23; h++) hours.push(h);
  hours.push(24, 25); // 12AM, 1AM next day
  return hours;
}
function labelHour(h) {
  const dayOffset = h >= 24 ? " (+1)" : "";
  const hh = h % 24;
  const ampm = hh >= 12 ? "PM" : "AM";
  const disp = ((hh + 11) % 12) + 1;
  return `${disp}:00 ${ampm}${dayOffset}`;
}
function computeDateTime(businessDateISO, hourLike) {
  const [year, month, day] = String(businessDateISO).split("-").map(Number);
  const h = hourLike % 24;
  const dayAdd = hourLike >= 24 ? 1 : 0;
  const manilaOffsetHours = 8;
  return new Date(Date.UTC(year, month - 1, day + dayAdd, h - manilaOffsetHours, 0, 0, 0));
}
function toManilaOffsetISOString(value) {
  const date = value instanceof Date ? value : new Date(value);
  const manila = new Date(date.getTime() + 8 * 3600000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${manila.getUTCFullYear()}-${pad(manila.getUTCMonth() + 1)}-${pad(manila.getUTCDate())}T${pad(manila.getUTCHours())}:${pad(manila.getUTCMinutes())}:00+08:00`;
}
function formatManilaDateTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(",", "");
}
function canChangeBooking(startAtISO) {
  const now = new Date();
  const start = new Date(startAtISO);
  const diffDays = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= RESCHEDULE_MIN_DAYS;
}
function reasonToLabel(reason) {
  if (reason === "available") return "Available";
  if (reason === "booked") return "Booked";
  if (reason === "buffer") return "Buffer";
  if (reason === "too-soon") return "Too soon (3-hour rule)";
  if (reason === "closed-hours") return "Closed";
  return "Closed";
}

function availabilityStatusClass(slot) {
  if (slot.available) return "text-green-600";
  if (slot.reason === "booked") return "text-red-700";
  if (slot.reason === "buffer") return "text-yellow-700";
  return "text-slate-500";
}

function availabilityCardClass(slot) {
  if (slot.available) return "bg-white border-slate-200 hover:bg-slate-50";
  if (slot.reason === "booked") return "bg-red-50 border-red-300 text-red-900 cursor-not-allowed";
  if (slot.reason === "buffer") return "bg-yellow-50 border-yellow-300 text-yellow-900 cursor-not-allowed";
  return "bg-slate-50 border-slate-200 opacity-70 cursor-not-allowed";
}

export function BookingAvailabilityOnly({
  initialDateISO,
  extensionEnabled = false,
  extensionHours = 0,
  onSelectSlot,
}) {
  const [dateISO, setDateISO] = useState(
    initialDateISO || toISODate(new Date())
  );
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [notice, setNotice] = useState(null);

  const slotHours = useMemo(() => buildSlotHours(), []);

  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeDateTime(dateISO, OPERATING_START_HOUR);
      const dayEnd = computeDateTime(dateISO, 26);

      const queryStart = new Date(dayStart.getTime() - BUFFER_HOURS * 3600000).toISOString();
      const queryEnd = new Date(dayEnd.getTime() + BUFFER_HOURS * 3600000).toISOString();

      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("id, start_at, end_at, status")
        .in("status", ["pending", "confirmed"])
        .lt("start_at", queryEnd)
        .gt("end_at", queryStart)
        .order("start_at", { ascending: true });

      if (error) {
        setNotice(error.message);
        setBookings([]);
      } else {
        setBookings(data || []);
      }
      setLoadingBookings(false);
    }

    fetchBookingsForDate();
  }, [dateISO]);

  const availability = useMemo(() => {
    const ext = extensionEnabled ? Number(extensionHours || 0) : 0;
    const totalMinutes = BASE_BOOKING_MINUTES + ext * 60;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 3600000);
    const operatingEnd = computeDateTime(dateISO, 26);

    return slotHours.map((h) => {
      const slotStart = computeDateTime(dateISO, h);
      const slotEnd = new Date(slotStart.getTime() + totalMinutes * 60000);

      const verdict = classifySlot({
        slotStart,
        slotEnd,
        operatingEnd,
        minAllowed,
        bookings,
      });

      return { hour: h, label: labelHour(h), ...verdict };
    });
  }, [slotHours, dateISO, bookings, extensionEnabled, extensionHours]);

  return (
    <div className="space-y-4">
      {notice ? (
        <div className="bg-sky-50 border border-slate-200 text-slate-600 font-medium rounded-2xl p-4 text-xs">
          ⚠️ {stripCitationsAndLinks(notice)}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-widest text-slate-500">
            Target Reservation Day
          </label>
          <input
            type="date"
            value={dateISO}
            min={toISODate(new Date())}
            onChange={(e) => setDateISO(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-normal text-slate-700 focus:outline-none focus:border-sky-500"
          />
        </div>
        <div className="text-right">
          <div className="text-[10px] font-normal uppercase text-slate-500">
            Duration
          </div>
          <div className="text-[15px] font-bold uppercase tracking-widest text-slate-800">
            3 Hours          
          </div>
        </div>
      </div>

      {loadingBookings ? (
        <div className="py-10 flex justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#5b7288] animate-spin rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {availability.map((s) => {
            const status = reasonToLabel(s.reason);

            const cls = `${availabilityCardClass(s)} ${availabilityStatusClass(s)}`;

            return (
              <button
                key={s.hour}
                disabled={!s.available}
                onClick={() => s.available && onSelectSlot?.({ dateISO, hour: s.hour })}
                className={`p-3 rounded-xl border text-xs font-normal transition-all text-left ${cls}`}
                type="button"
                title={status}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{s.label}</span>
                  <span className="text-[10px] font-normal uppercase tracking-wider text-slate-500">
                    {status}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function classifySlot({ slotStart, slotEnd, operatingEnd, minAllowed, bookings }) {
  if (slotEnd > operatingEnd) return { available: false, reason: "closed-hours" };

  for (const b of bookings || []) {
    const bStart = new Date(b.start_at);
    let bEnd = new Date(b.end_at);

    if (
      bEnd.getMinutes() === 0 &&
      bEnd.getSeconds() === 0 &&
      bEnd.getMilliseconds() === 0
    ) {
      bEnd = new Date(bEnd.getTime() - 1);
    }

    const endHourBlock = new Date(bEnd);
    endHourBlock.setMinutes(0, 0, 0);

    const bufferBefore = new Date(bStart.getTime() - BUFFER_HOURS * 3600000);
    const bufferAfter = new Date(endHourBlock.getTime() + BUFFER_HOURS * 3600000);

    if (slotStart >= bStart && slotStart <= endHourBlock) {
      return { available: false, reason: "booked" };
    }
    if (slotStart.getTime() === bufferBefore.getTime()) {
      return { available: false, reason: "buffer" };
    }
    if (slotStart.getTime() === bufferAfter.getTime()) {
      return { available: false, reason: "buffer" };
    }
  }

  if (slotStart < minAllowed) return { available: false, reason: "too-soon" };
  return { available: true, reason: "available" };
}

/* =======================
 Component
======================= */
export default function BookingForm({ user, member }) {
  const [tab, setTab] = useState("availability"); // availability | packages | book | manage

  // ✅ FIX: Load directly from local file config instead of calling database table
  const packages = useMemo(() => Object.values(PACKAGE_POLICIES), []);

  const [dateISO, setDateISO] = useState(() => toISODate(new Date()));
  const [bookings, setBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  const [selectedHour, setSelectedHour] = useState(null);
  const [notice, setNotice] = useState(null);

  const [successBooking, setSuccessBooking] = useState(null);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPkg, setDetailsPkg] = useState(null);

  const [payOpen, setPayOpen] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [myBookings, setMyBookings] = useState([]);
  const [loadingMyBookings, setLoadingMyBookings] = useState(false);

  const [manageFilter, setManageFilter] = useState("all"); // all | upcoming | past

  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedBooking, setReschedBooking] = useState(null);
  const [reschedDateISO, setReschedDateISO] = useState(() => toISODate(new Date()));
  const [reschedHour, setReschedHour] = useState(null);
  const [reschedLoading, setReschedLoading] = useState(false);
  const [reschedBookings, setReschedBookings] = useState([]);

  const [editBooking, setEditBooking] = useState(null);
  const [editLoading, setEditLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    event_type: "",
    contact_number: "",
    email: "",
    guest_count: 1,
    package_id: "",
    extend: "no",
    extension_hours: 0,
  });

  useEffect(() => {
    setForm((f) => ({
      ...f,
      name: f.name || member?.customer_name || "",
      contact_number: f.contact_number || member?.["Phone"] || "",
      email: f.email || member?.["Email"] || user?.email || "",
    }));
  }, [member, user]);

  useEffect(() => {
    async function fetchBookingsForDate() {
      setLoadingBookings(true);
      setNotice(null);

      const dayStart = computeDateTime(dateISO, OPERATING_START_HOUR);
      const dayEnd = computeDateTime(dateISO, 26);

      const queryStart = new Date(dayStart.getTime() - BUFFER_HOURS * 3600000).toISOString();
      const queryEnd = new Date(dayEnd.getTime() + BUFFER_HOURS * 3600000).toISOString();

      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("id, start_at, end_at, status")
        .in("status", ["pending", "confirmed"])
        .lt("start_at", queryEnd)
        .gt("end_at", queryStart)
        .order("start_at", { ascending: true });

      if (error) {
        setNotice(error.message);
        setBookings([]);
      } else {
        setBookings(data || []);
      }

      setLoadingBookings(false);
    }

    fetchBookingsForDate();
  }, [dateISO]);

  const slotHours = useMemo(() => buildSlotHours(), []);

  const availability = useMemo(() => {
    const ext = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const totalMinutes = BASE_BOOKING_MINUTES + ext * 60;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 3600000);
    const operatingEnd = computeDateTime(dateISO, 26);

    return slotHours.map((h) => {
      const slotStart = computeDateTime(dateISO, h);
      const slotEnd = new Date(slotStart.getTime() + totalMinutes * 60000);

      const verdict = classifySlot({
        slotStart,
        slotEnd,
        operatingEnd,
        minAllowed,
        bookings,
      });
      return { hour: h, label: labelHour(h), ...verdict };
    });
  }, [slotHours, dateISO, bookings, form.extend, form.extension_hours]);

  useEffect(() => {
    if (!proofFile) {
      setProofPreview(null);
      return;
    }
    const url = URL.createObjectURL(proofFile);
    setProofPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [proofFile]);

  useEffect(() => {
    async function fetchMyBookings() {
      if (!user?.id) return;
      setLoadingMyBookings(true);
      setNotice(null);

      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("*")
        .eq("user_id", user.id)
        .order("start_at", { ascending: false });

      if (error) setNotice(error.message);
      else setMyBookings(data || []);

      setLoadingMyBookings(false);
    }
    fetchMyBookings();
  }, [user?.id]);

  const manageGroups = useMemo(() => {
    const now = new Date();
    const upcoming = [];
    const past = [];

    for (const b of myBookings || []) {
      const isPast = new Date(b.start_at) < now;
      (isPast ? past : upcoming).push(b);
    }

    upcoming.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    past.sort((a, b) => new Date(b.start_at) - new Date(a.start_at));

    return { upcoming, past };
  }, [myBookings]);

  useEffect(() => {
    async function fetchBookingsForReschedDate() {
      if (!reschedOpen || !reschedDateISO) return;

      const dayStart = computeDateTime(reschedDateISO, OPERATING_START_HOUR);
      const dayEnd = computeDateTime(reschedDateISO, 26);

      const queryStart = new Date(dayStart.getTime() - BUFFER_HOURS * 3600000).toISOString();
      const queryEnd = new Date(dayEnd.getTime() + BUFFER_HOURS * 3600000).toISOString();

      const { data, error } = await supabase
        .from("function_room_bookings")
        .select("id, start_at, end_at, status")
        .in("status", ["pending", "confirmed"])
        .lt("start_at", queryEnd)
        .gt("end_at", queryStart)
        .order("start_at", { ascending: true });

      if (error) {
        setNotice(error.message);
        setReschedBookings([]);
        return;
      }

      const filtered = (data || []).filter((x) => x.id !== reschedBooking?.id);
      setReschedBookings(filtered);
    }

    fetchBookingsForReschedDate();
  }, [reschedOpen, reschedDateISO, reschedBooking?.id]);

  const reschedAvailability = useMemo(() => {
    if (!reschedOpen || !reschedBooking) return [];

    const ext = Number(reschedBooking.extension_hours || 0);
    const totalMinutes = BASE_BOOKING_MINUTES + ext * 60;

    const now = new Date();
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 3600000);
    const operatingEnd = computeDateTime(reschedDateISO, 26);

    return slotHours.map((h) => {
      const slotStart = computeDateTime(reschedDateISO, h);
      const slotEnd = new Date(slotStart.getTime() + totalMinutes * 60000);

      const verdict = classifySlot({
        slotStart,
        slotEnd,
        operatingEnd,
        minAllowed,
        bookings: reschedBookings,
      });

      return { hour: h, label: labelHour(h), ...verdict };
    });
  }, [reschedOpen, reschedBooking, reschedDateISO, reschedBookings, slotHours]);

  function validateBookingInputs() {
    setNotice(null);

    if (!form.name.trim()) return "Name is required.";
    if (!form.event_type.trim()) return "Event type is required.";
    if (!dateISO) return "Date is required.";
    if (selectedHour == null) return "Time is required.";
    if (!form.package_id) return "Please select a package.";
    if (!form.contact_number.trim()) return "Contact number is required.";
    if (!form.email.trim()) return "Email address is required.";

    const guests = Number(form.guest_count || 0);
    if (!guests || guests < 1) return "No. of guests must be at least 1.";

    const extensionHours = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    if (extensionHours < 0 || extensionHours > MAX_EXTENSION_HOURS) {
      return `Extension must be 0–${MAX_EXTENSION_HOURS} hours.`;
    }

    const now = new Date();
    const selectedStart = computeDateTime(dateISO, selectedHour);
    const minAllowed = new Date(now.getTime() + MIN_ADVANCE_HOURS * 3600000);
    if (selectedStart < minAllowed) {
      return `Booking must be at least ${MIN_ADVANCE_HOURS} hours in advance.`;
    }

    return null;
  }

  function selectSlot(h) {
    setSelectedHour(h);
    setTab("book");
    setNotice(null);
  }

  function onBookNowClick() {
    const err = validateBookingInputs();
    if (err) return setNotice(err);
    setPayOpen(true);
  }

  async function confirmPaymentAndSubmit() {
    const err = validateBookingInputs();
    if (err) return setNotice(err);
    if (!proofFile) return setNotice("Please attach a screenshot of your payment confirmation.");

    const extensionHours = form.extend === "yes" ? Number(form.extension_hours || 0) : 0;
    const start = computeDateTime(dateISO, selectedHour);
    const totalMinutes = BASE_BOOKING_MINUTES + extensionHours * 60;
    const end = new Date(start.getTime() + totalMinutes * 60000);

    setSubmitting(true);
    setNotice(null);

    try {
      const fileExt = (proofFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user?.id || "guest"}/${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}.${fileExt}`;

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from("booking_proofs")
        .upload(path, proofFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: proofFile.type || "image/jpeg",
        });

      if (uploadErr) throw uploadErr;

      const { data: pub } = supabase.storage
        .from("booking_proofs")
        .getPublicUrl(uploadData.path);

      const proofUrl = pub?.publicUrl || null;

      const payload = {
        user_id: user?.id || null,
        member_id: member?.id || null,
        package_id: Number(form.package_id),
        customer_name: form.name.trim(),
        event_type: form.event_type.trim(),
        business_date: dateISO,
        start_at: toManilaOffsetISOString(start),
        end_at: toManilaOffsetISOString(end),
        duration_hours: 3,
        extension_hours: extensionHours,
        guest_count: Number(form.guest_count),
        contact_number: form.contact_number.trim(),
        email: form.email.trim(),
        deposit_amount: DEPOSIT_AMOUNT,
        payment_status: "submitted",
        payment_proof_url: proofUrl,
        status: "pending",
      };

      const { data: bookingRow, error: bookErr } = await supabase.rpc("create_booking", {
        data: payload,
      });

      if (bookErr) throw bookErr;

      try {
        await fetch("/api/booking-notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminEmail: ADMIN_EMAIL,
            bookingId: bookingRow?.id,
            customerName: payload.customer_name,
            eventType: payload.event_type,
            businessDate: payload.business_date,
            timeLabel: `${formatManilaDateTime(payload.start_at)} - ${formatManilaDateTime(payload.end_at)}`,
            packageId: payload.package_id,
            guestCount: payload.guest_count,
            contactNumber: payload.contact_number,
            customerEmail: payload.email,
            extensionHours: payload.extension_hours,
            depositAmount: payload.deposit_amount,
            proofUrl,
          }),
        });
      } catch {}

      setSuccessBooking(bookingRow);
      setPayOpen(false);
      setProofFile(null);
      setProofPreview(null);
      setSelectedHour(null);
      setTab("availability");
    } catch (e) {
      console.error("❌ FULL ERROR:", e);
      const msg = String(e?.message || "");
      if (msg.includes("no_overlap_function_room")) {
        setNotice("Selected time is no longer available. Please choose another slot.");
      } else {
        alert(e?.message || "Something went wrong");
        setNotice(e?.message || "Something went wrong");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (successBooking) {
    return (
      <div className="min-h-screen bg-[#f0f7fb] flex items-center justify-center px-4">
        <div className="bg-white rounded-[28px] border border-sky-50 shadow-sm p-6 max-w-md w-full space-y-4 animate-in fade-in">
          <div className="text-center space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              Booking Confirmed
            </p>
            <h2 className="text-xl font-semibold text-slate-800">
              Reservation Received ✅
            </h2>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
            <p>
              <span className="text-slate-500">Reference:</span>{" "}
              <b>{successBooking.reference_code || successBooking.id}</b>
            </p>
            <p>
              <span className="text-slate-500">Name:</span>{" "}
              <b>{successBooking.customer_name}</b>
            </p>
            <p>
              <span className="text-slate-500">Date:</span>{" "}
              <b>{formatDate(successBooking.business_date)}</b>
            </p>
            <p>
              <span className="text-slate-500">Status:</span>{" "}
              <b className="text-blue-500">Pending Confirmation</b>
            </p>
          </div>

          <p className="text-[12px] text-slate-500 text-center">
            We will review your payment and confirm shortly.
          </p>

          <button
            onClick={() => {
              setSuccessBooking(null);
              setTab("availability");
            }}
            className="w-full py-3 rounded-xl bg-slate-600 text-white text-[11px] uppercase tracking-widest active:scale-95 hover:bg-sky-500"
          >
            Back to Booking
          </button>
        </div>
      </div>
    );
  }

  function renderBookingCard(b) {
    const now = new Date();
    const isPast = new Date(b.start_at) < now;
    const allowChange = !isPast && canChangeBooking(b.start_at);

    const statusMap = {
      confirmed: { text: "Confirmed", color: "bg-green-100 text-green-700" },
      pending: { text: "Pending", color: "bg-blue-100 text-blue-700" },
      rejected: { text: "Rejected", color: "bg-red-100 text-red-700" },
      cancelled_gc: { text: "Gift Certificate", color: "bg-yellow-100 text-yellow-700" },
    };

    const status = statusMap[b.status] || {
      text: String(b.status || "Unknown"),
      color: "bg-slate-100 text-slate-600",
    };

    return (
      <div
        key={b.id}
        className={`bg-white rounded-2xl border border-sky-50 shadow-sm p-5 transition-all ${
          isPast ? "opacity-70" : "hover:shadow-md"
        }`}
      >
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs tracking-widest text-slate-500 uppercase">Reference</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {b.reference_code || b.id}
            </p>

            <p className="text-xs text-slate-500">
              <b>{formatDate(b.business_date)}</b> / {formatDateTime(b.start_at)}
            </p>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`inline-block px-3 py-1 text-xs rounded-full font-medium ${status.color}`}>
                {status.text}
              </span>

              <span className="inline-block px-3 py-1 text-xs rounded-full font-medium bg-slate-50 text-slate-600 border border-slate-200">
                Guests: {b.guest_count || 0} • Ext: {b.extension_hours || 0}h
              </span>
            </div>

            {!isPast && !allowChange && (
              <p className="text-[11px] text-slate-500 mt-2">
                Changes disabled — must be at least {RESCHEDULE_MIN_DAYS} days before booking.
              </p>
            )}

            {isPast && (
              <p className="text-[11px] text-slate-500 mt-2">
                Past booking — actions are disabled.
              </p>
            )}
          </div>

          {!isPast && (
            <div className="flex flex-col gap-2 min-w-[140px]">
              <button
                disabled={!allowChange}
                onClick={() => allowChange && setEditBooking({ ...b })}
                className={`w-full py-2 rounded-lg text-xs font-medium ${
                  allowChange
                    ? "bg-blue-500 text-white hover:bg-blue-600"
                    : "bg-slate-100 text-slate-500 cursor-not-allowed"
                }`}
              >
                Update
              </button>

              <button
                disabled={!allowChange}
                onClick={() => {
                  if (!allowChange) return;
                  setReschedBooking(b);
                  setReschedDateISO(toISODate(new Date(b.start_at)));
                  setReschedHour(null);
                  setReschedOpen(true);
                }}
                className={`w-full py-2 rounded-lg text-xs font-medium ${
                  allowChange
                    ? "border border-slate-200 bg-white hover:bg-slate-50"
                    : "bg-slate-100 text-slate-500 cursor-not-allowed"
                }`}
              >
                Reschedule
              </button>

              <button
                onClick={async () => {
                  const ok = confirm(
                    "Cancel this booking? It will convert into a gift certificate."
                  );
                  if (!ok) return;

                  const { error } = await supabase
                    .from("function_room_bookings")
                    .update({ status: "cancelled_gc" })
                    .eq("id", b.id);

                  if (error) {
                    setNotice(error.message);
                    return;
                  }

                  setMyBookings((prev) =>
                    prev.map((x) => (x.id === b.id ? { ...x, status: "cancelled_gc" } : x))
                  );

                  setNotice("✅ Booking cancelled and converted to gift certificate.");
                }}
                className="w-full py-2 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl md:text-[28px] font-normal text-slate-800 tracking-tight">
          Function Room Booking
        </h2>
        <p className="text-slate-500 text-xs md:text-sm mt-0.5 font-normal">
          {stripCitationsAndLinks(
            `Booking is 2 hours 59 minutes + optional extension (max ${MAX_EXTENSION_HOURS} hours).`
          )}
        </p>
      </div>

      <div className="w-full max-w-xs">
        <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">
          Select Option
        </label>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm text-slate-700"
        >
          <option value="availability">Check Availability</option>
          <option value="packages">Packages</option>
          <option value="book">Book Now</option>
          <option value="manage">Manage Booking</option>
        </select>
      </div>

      {notice && (
        <div className="bg-white border border-slate-200 text-slate-700 rounded-xl p-3 text-[12px]">
          {stripCitationsAndLinks(notice)}
        </div>
      )}

      {/* Availability */}
      {tab === "availability" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-sky-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Select Date</p>
              <input
                type="date"
                value={dateISO}
                min={toISODate(new Date())}
                onChange={(e) => setDateISO(e.target.value)}
                className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Must be at least {MIN_ADVANCE_HOURS} hours in advance.
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Extension</p>
              <div className="mt-2 flex items-center gap-2 justify-end">
                <select
                  value={form.extend}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      extend: e.target.value,
                      extension_hours: e.target.value === "yes" ? f.extension_hours : 0,
                    }))
                  }
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>

                <select
                  value={form.extension_hours}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, extension_hours: Number(e.target.value) }))
                  }
                  disabled={form.extend !== "yes"}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value={0}>0 hr</option>
                  <option value={1}>1 hr</option>
                  <option value={2}>2 hr</option>
                </select>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            Operating hours: <b>10:00 AM – 2:00 AM</b> (next day). Buffer rule:{" "}
            <b>1 hour</b> before & after.
          </div>

          {loadingBookings ? (
            <div className="min-h-[120px] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-sky-200 border-t-[#5b7288] animate-spin rounded-full" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availability.map((s) => {
                const status = reasonToLabel(s.reason);
                const statusClass = availabilityStatusClass(s);

                return (
                  <button
                    type="button"
                    key={s.hour}
                    onClick={() => s.available && selectSlot(s.hour)}
                    className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                      s.available
                        ? "bg-[#f0f7fb] border-slate-200 hover:bg-sky-50"
                        : availabilityCardClass(s)
                    }`}
                    disabled={!s.available}
                  >
                    <p className="text-[11px] font-semibold text-slate-800">{s.label}</p>
                    <p className={`text-[10px] mt-1 ${statusClass}`}>{status}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Packages */}
      {tab === "packages" && (
        <div className="space-y-3">
          {packages.map((p) => {
            const pid = Number(p.id);
            const policy = PACKAGE_POLICIES[pid];
            const consumable = policy?.rental_fees_inclusions?.consumable_amount ?? null;
            const roomRentalOnly = policy?.rental_fees_inclusions?.room_rental_only ?? false;

            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl md:rounded-[28px] border border-sky-50 shadow-sm p-5 md:p-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[12px] uppercase tracking-widest text-slate-500">
                      {p.name}
                    </p>
                    <h3 className="text-lg md:text-xl font-semibold text-slate-800 mt-1">
                      ₱{Number(p.rental_fee).toLocaleString()}
                    </h3>

                    <div className="mt-2 space-y-1 min-w-0">
                      <p className="text-[11px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                        Capacity up to {p.capacity} guests
                      </p>
                      <p className="text-[11px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                        {roomRentalOnly
                          ? "Room rental only"
                          : `Consumable: ${formatPeso(consumable || 0)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsPkg(p);
                        setDetailsOpen(true);
                      }}
                      className="px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-700 text-[10px] uppercase tracking-widest hover:bg-slate-50 active:scale-95"
                    >
                      Full Details
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) => ({ ...f, package_id: String(p.id) }));
                        setTab("book");
                      }}
                      className="px-4 py-2 rounded-full bg-slate-600 text-white text-[10px] uppercase tracking-widest active:scale-95"
                    >
                      Choose
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Book Now */}
      {tab === "book" && (
        <div className="bg-white rounded-2xl md:rounded-[28px] border border-sky-50 shadow-sm p-5 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Selected</p>
              <p className="text-[12px] text-slate-800 mt-1">
                Date: <b>{formatDate(dateISO)}</b> / Time:{" "}
                <b>{selectedHour != null ? labelHour(selectedHour) : "Not selected"}</b>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setTab("availability")}
              className="px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-[10px] uppercase tracking-widest active:scale-95"
            >
              Pick Time
            </button>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              Package Selection
            </label>

            <select
              value={form.package_id}
              onChange={(e) => setForm((f) => ({ ...f, package_id: e.target.value }))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
            >
              <option value="">Select package…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₱{Number(p.rental_fee).toLocaleString()} (pax {p.capacity})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ["name", "Name", "text", "Full name"],
              ["event_type", "Event Type", "text", "Birthday, Gathering, Meeting..."],
              ["contact_number", "Contact Number", "tel", "09XX XXX XXXX"],
              ["email", "Email Address", "email", "name@email.com"],
            ].map(([key, lbl, type, ph]) => (
              <div key={key}>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                  {lbl}
                </label>
                <input
                  type={type}
                  value={form[key] ?? ""}
                  placeholder={ph}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
                />
              </div>
            ))}

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                No. of Guests
              </label>
              <input
                type="number"
                min={1}
                value={form.guest_count}
                onChange={(e) =>
                  setForm((f) => ({ ...f, guest_count: Number(e.target.value) }))
                }
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onBookNowClick}
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-slate-600 text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-sky-500 active:scale-95 disabled:opacity-60"
          >
            Book Now
          </button>
        </div>
      )}

      {/* Manage Booking */}
      {tab === "manage" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl md:rounded-[28px] border border-sky-50 shadow-sm p-5 md:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-xl font-semibold text-slate-800">Manage Your Bookings</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Update or reschedule at least <b>{RESCHEDULE_MIN_DAYS} days</b> before your event.
                </p>
              </div>

              <div className="w-full sm:w-auto">
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                  View
                </label>
                <select
                  value={manageFilter}
                  onChange={(e) => setManageFilter(e.target.value)}
                  className="w-full sm:w-[180px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="all">All</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="past">Past</option>
                </select>
              </div>
            </div>
          </div>

          {loadingMyBookings ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-sky-200 border-t-[#5b7288] rounded-full animate-spin" />
            </div>
          ) : myBookings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-sky-50 shadow-sm p-6 text-center">
              <p className="text-slate-500 text-sm">No bookings found.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(manageFilter === "all" || manageFilter === "upcoming") && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">Upcoming</h4>
                  {manageGroups.upcoming.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-sky-50 shadow-sm p-6 text-center">
                      <p className="text-slate-500 text-sm">No upcoming bookings.</p>
                    </div>
                  ) : (
                    manageGroups.upcoming.map(renderBookingCard)
                  )}
                </div>
              )}

              {(manageFilter === "all" || manageFilter === "past") && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">Past</h4>
                  {manageGroups.past.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-sky-50 shadow-sm p-6 text-center">
                      <p className="text-slate-500 text-sm">No past bookings.</p>
                    </div>
                  ) : (
                    manageGroups.past.map(renderBookingCard)
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Update Booking Modal */}
      {editBooking && (
        <div
          className="fixed inset-0 z-[97] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !editLoading && setEditBooking(null)}
        >
          <div
            className="bg-white rounded-[28px] border border-sky-50 shadow-sm p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-500">Update Booking</p>
                <h3 className="text-lg font-semibold text-slate-800">Booking Info</h3>
              </div>
              <button
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                onClick={() => !editLoading && setEditBooking(null)}
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-slate-500 mb-4">
              Only package, guests, and event type can be changed. Allowed only if booking is at least {RESCHEDULE_MIN_DAYS} days away.
            </p>

            <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
              Package
            </label>
            <select
              value={editBooking.package_id}
              onChange={(e) =>
                setEditBooking((prev) => ({ ...prev, package_id: Number(e.target.value) }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm mb-3"
            >
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
              No. of Guests
            </label>
            <input
              type="number"
              min={1}
              value={editBooking.guest_count || 1}
              onChange={(e) =>
                setEditBooking((prev) => ({ ...prev, guest_count: Number(e.target.value) }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm mb-3"
            />

            <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-1">
              Event Type
            </label>
            <input
              type="text"
              value={editBooking.event_type || ""}
              onChange={(e) =>
                setEditBooking((prev) => ({ ...prev, event_type: e.target.value }))
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm mb-4"
            />

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => !editLoading && setEditBooking(null)}
                className="w-full py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-[11px] uppercase tracking-widest active:scale-95"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={editLoading}
                onClick={async () => {
                  if (!canChangeBooking(editBooking.start_at)) {
                    alert(`Updates are only allowed at least ${RESCHEDULE_MIN_DAYS} days before the booking.`);
                    return;
                  }

                  setEditLoading(true);

                  const { error } = await supabase
                    .from("function_room_bookings")
                    .update({
                      package_id: editBooking.package_id,
                      guest_count: editBooking.guest_count,
                      event_type: editBooking.event_type,
                      status: "pending",
                    })
                    .eq("id", editBooking.id);

                  if (error) {
                    alert(error.message);
                    setEditLoading(false);
                    return;
                  }

                  setMyBookings((prev) =>
                    prev.map((x) =>
                      x.id === editBooking.id ? { ...x, ...editBooking, status: "pending" } : x
                    )
                  );

                  setEditLoading(false);
                  setEditBooking(null);
                  setNotice("✅ Booking updated. Waiting for confirmation.");
                }}
                className="w-full py-3 rounded-xl bg-slate-600 text-white text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-60"
              >
                {editLoading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedOpen && reschedBooking && (
        <div
          className="fixed inset-0 z-[96] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => !reschedLoading && setReschedOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg md:text-xl font-semibold text-slate-800">
                Reschedule Booking
              </h3>
              <button
                type="button"
                onClick={() => !reschedLoading && setReschedOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Reference: <b>{reschedBooking.reference_code || reschedBooking.id}</b>
              </p>

              <div>
                <label className="block text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                  New Date
                </label>
                <input
                  type="date"
                  value={reschedDateISO}
                  min={toISODate(new Date())}
                  onChange={(e) => setReschedDateISO(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {reschedAvailability.map((s) => {
                  const status = reasonToLabel(s.reason);
                  const statusClass = availabilityStatusClass(s);

                  return (
                    <button
                      key={s.hour}
                      type="button"
                      disabled={!s.available}
                      onClick={() => s.available && setReschedHour(s.hour)}
                      className={`p-3 rounded-xl border text-left transition-all active:scale-95 ${
                        reschedHour === s.hour
                          ? "border-sky-500 bg-sky-50"
                          : availabilityCardClass(s)
                      }`}
                    >
                      <p className="text-[11px] font-semibold text-slate-800">{s.label}</p>
                      <p className={`text-[10px] mt-1 ${statusClass}`}>{status}</p>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={reschedLoading || reschedHour == null}
                onClick={async () => {
                  if (reschedHour == null) return;
                  if (!canChangeBooking(reschedBooking.start_at)) {
                    setNotice(
                      `Reschedule allowed only if at least ${RESCHEDULE_MIN_DAYS} days before booking.`
                    );
                    return;
                  }

                  setReschedLoading(true);
                  setNotice(null);

                  const ext = Number(reschedBooking.extension_hours || 0);
                  const totalMinutes = BASE_BOOKING_MINUTES + ext * 60;

                  const newStart = computeDateTime(reschedDateISO, reschedHour);
                  const newEnd = new Date(newStart.getTime() + totalMinutes * 60000);

                  const { error } = await supabase
                    .from("function_room_bookings")
                    .update({
                      business_date: reschedDateISO,
                      start_at: toManilaOffsetISOString(newStart),
                      end_at: toManilaOffsetISOString(newEnd),
                      status: "pending",
                    })
                    .eq("id", reschedBooking.id);

                  if (error) {
                    setNotice(error.message);
                    setReschedLoading(false);
                    return;
                  }

                  setMyBookings((prev) =>
                    prev.map((x) =>
                      x.id === reschedBooking.id
                        ? {
                            ...x,
                            business_date: reschedDateISO,
                            start_at: toManilaOffsetISOString(newStart),
                            end_at: toManilaOffsetISOString(newEnd),
                            status: "pending",
                          }
                        : x
                    )
                  );

                  setReschedLoading(false);
                  setReschedOpen(false);
                  setNotice("✅ Booking rescheduled! Waiting for confirmation.");
                }}
                className="w-full py-3.5 rounded-xl bg-slate-600 text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-sky-500 active:scale-95 disabled:opacity-60"
              >
                {reschedLoading ? "Updating…" : "Confirm Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payOpen && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => !submitting && setPayOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-7 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg md:text-xl font-semibold text-slate-800">
                Secure Your Booking
              </h3>
              <button
                type="button"
                onClick={() => !submitting && setPayOpen(false)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-slate-700">
              <p className="text-sm leading-relaxed">
                {stripCitationsAndLinks(
                  `To secure your booking, a ₱${DEPOSIT_AMOUNT.toLocaleString()} non-refundable fee is required.`
                )}
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">
                  Scan QR to Pay
                </p>
                <img
                  src={QR_IMAGE_PATH}
                  alt="Payment QR Code"
                  className="w-full max-w-[320px] mx-auto rounded-xl border border-slate-200 bg-white"
                />

                <p className="text-[12px] text-slate-700 mt-3">
                  After payment, attach screenshot of your payment confirmation to lock in your
                  reservation!
                </p>

                <input
                  type="file"
                  accept="image/*"
                  className="mt-3 w-full text-sm"
                  onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                  disabled={submitting}
                />

                {proofPreview && (
                  <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden">
                    <img
                      src={proofPreview}
                      alt="Payment proof preview"
                      className="w-full object-cover"
                    />
                  </div>
                )}

                {!proofFile && (
                  <p className="mt-2 text-[11px] text-sky-500">
                    Please upload your payment proof before submitting.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={confirmPaymentAndSubmit}
                disabled={submitting || !proofFile}
                className="w-full py-3.5 rounded-xl bg-slate-600 text-white font-normal text-[11px] md:text-[12px] uppercase tracking-widest hover:bg-sky-500 active:scale-95 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit Proof & Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Details Modal */}
      {detailsOpen && detailsPkg && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4"
          onClick={() => setDetailsOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-t-[28px] md:rounded-[32px] p-6 md:p-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const pid = Number(detailsPkg.id);
              const policy = PACKAGE_POLICIES[pid];
              if (!policy) return <p className="text-slate-700">No policy details found.</p>;
              const rfi = policy.rental_fees_inclusions;

              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">
                        Full Details
                      </p>
                      <h3 className="text-xl md:text-2xl font-semibold text-slate-900 mt-1">
                        {policy.name}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDetailsOpen(false)}
                      className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                      1. Room Usage
                    </p>
                    <ul className="space-y-2 text-[12px] text-slate-700 leading-relaxed">
                      <li>• {policy.room_usage.capacity}</li>
                      <li>• {policy.room_usage.additional_guests}</li>
                      <li>• {policy.room_usage.rental_duration}</li>
                      {policy.room_usage.extension.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                      2. Rental Fees & Inclusions
                    </p>
                    <p className="text-[12px] text-slate-700 mb-3">• {rfi.rental_fee}</p>

                    <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-2">
                      Package Includes
                    </p>
                    <ul className="space-y-2 text-[12px] text-slate-700 leading-relaxed">
                      {rfi.package_includes.map((x) => (
                        <li key={x}>• {x}</li>
                      ))}
                    </ul>

                    <p className="text-[12px] text-slate-700 mt-3">
                      •{" "}
                      {rfi.room_rental_only ? (
                        <b>Room rental only</b>
                      ) : (
                        <>
                          Consumable: <b>{formatPeso(rfi.consumable_amount)}</b>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="bg-white border border-sky-200 rounded-2xl p-4">
                    <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2">
                      3. Food & Beverages
                    </p>
                    <p className="text-[12px] text-slate-700 mb-2">
                      • {policy.food_beverages.policy}
                    </p>
                    {policy.food_beverages.corkage.length > 0 && (
                      <ul className="space-y-1 text-[12px] text-slate-700 leading-relaxed ml-3">
                        {policy.food_beverages.corkage.map((x) => (
                          <li key={x}>◦ {x}</li>
                        ))}
                      </ul>
                    )}
                    {policy.food_beverages.notes && (
                      <p className="text-[12px] text-slate-700 mt-3">
                        • {policy.food_beverages.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
