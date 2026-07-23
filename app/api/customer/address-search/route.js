function normalizeSuggestion(row) {
  const label = String(row?.label || "").replace(/\s+/g, " ").trim();
  const lat = Number(row?.lat);
  const lng = Number(row?.lng);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(row?.id || `${label}-${lat}-${lng}`),
    label,
    lat: lat.toFixed(7),
    lng: lng.toFixed(7),
  };
}

function uniqueSuggestions(rows) {
  const seen = new Set();
  return rows
    .map(normalizeSuggestion)
    .filter(Boolean)
    .filter((row) => {
      const key = `${row.label.toLowerCase()}|${row.lat}|${row.lng}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

async function nominatimSearch(query) {
  const params = new URLSearchParams({
    q: /philippines/i.test(query) ? query : `${query}, Philippines`,
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "ph",
    limit: "8",
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-PH,en;q=0.9",
      "User-Agent": "JUJA-Brew-and-Bites/1.0 customer-address-search",
    },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!response.ok) return [];
  const rows = await response.json().catch(() => []);
  return uniqueSuggestions(
    (Array.isArray(rows) ? rows : []).map((row) => ({
      id: row.place_id || row.osm_id || row.display_name,
      label: row.display_name,
      lat: row.lat,
      lng: row.lon,
    }))
  );
}

async function photonSearch(query) {
  const params = new URLSearchParams({
    q: query,
    limit: "8",
    lang: "en",
    lat: "14.6760",
    lon: "121.0437",
  });
  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 60 * 60 * 24 },
  });
  if (!response.ok) return [];
  const json = await response.json().catch(() => ({}));
  return uniqueSuggestions(
    (Array.isArray(json?.features) ? json.features : [])
      .filter((feature) => String(feature?.properties?.countrycode || "").toLowerCase() === "ph")
      .map((feature) => {
        const props = feature.properties || {};
        const coords = feature.geometry?.coordinates || [];
        const parts = [props.name, props.street, props.city, props.county, props.state, props.country]
          .filter(Boolean)
          .map((value) => String(value).trim());
        return {
          id: props.osm_id || props.name,
          label: parts.join(", "),
          lat: coords[1],
          lng: coords[0],
        };
      })
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = String(searchParams.get("q") || "").trim();

  if (query.length < 3) {
    return Response.json({ success: true, suggestions: [] });
  }

  try {
    const primary = await nominatimSearch(query);
    const fallback = primary.length ? [] : await photonSearch(query);
    return Response.json({ success: true, suggestions: uniqueSuggestions([...primary, ...fallback]) });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Address search failed.", suggestions: [] },
      { status: 502 }
    );
  }
}
