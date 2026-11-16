export function bookingsForSavedTicket(upcoming = [], savedBooking = null, resuming = false) {
  // A locked saved ticket must resolve its exact persisted booking, not another
  // eligible booking that happens to be present in the general selector.
  if (resuming) return savedBooking?.id ? [savedBooking] : [];
  return upcoming;
}
