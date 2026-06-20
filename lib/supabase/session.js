export async function getStableSession(supabase, { attempts = 6, delayMs = 250 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) return { session: null, error };
    if (data?.session) return { session: data.session, error: null };

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session || null, error: error || null };
}
