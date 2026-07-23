export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "").trim();

  if (query.length < 3) {
    return Response.json({ success: true, suggestions: [] });
  }

  try {
    const params = new URLSearchParams({
      q: /philippines/i.test(query) ? query : `${query}, Philippines`,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "ph",
      limit: "8",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "JUJA-Brew-and-Bites/1.0 customer-address-search",
      },
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      throw new Error("Address search service unavailable.");
    }

    const rows = await response.json();
    const suggestions = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: String(row.place_id || row.osm_id || row.display_name),
        label: String(row.display_name || "").replace(/\s+/g, " ").trim(),
        lat: row.lat ? Number(row.lat).toFixed(7) : "",
        lng: row.lon ? Number(row.lon).toFixed(7) : "",
      }))
      .filter((row) => row.label && row.lat && row.lng);

    return Response.json({ success: true, suggestions });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Address search failed.", suggestions: [] },
      { status: 502 }
    );
  }
}
