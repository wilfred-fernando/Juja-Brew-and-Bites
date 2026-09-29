import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const { data, error } = await client.from("order_display_images").select("id,url").order("sort_order").order("created_at").order("id");
    if (error) throw error;
    return Response.json({ images: data }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to load display images." }, { status: 503 });
  }
}
