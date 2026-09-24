export async function createManualBooking(supabase, payload) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error("Please sign in again before creating a booking.");
  const response = await fetch("/api/bookings/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Manual booking failed.");
  return result;
}
