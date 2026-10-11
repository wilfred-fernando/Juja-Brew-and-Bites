export async function getStableSession(supabase, { attempts = 6, delayMs = 250 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    lastError = error || null;
    if (data?.session) return { session: data.session, error: null };

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session || null, error: error || lastError || null };
}

export function maintainPortalSession(supabase, target, document) {
  let restoring = false;
  const restore = async () => {
    if (document.hidden || restoring) return;
    restoring = true;
    try {
      supabase.auth.startAutoRefresh();
      await getStableSession(supabase);
    } catch {
      // A temporary network failure must not sign the user out.
    } finally {
      restoring = false;
    }
  };
  target.addEventListener('online', restore);
  document.addEventListener('visibilitychange', restore);
  void restore();
  return () => {
    target.removeEventListener('online', restore);
    document.removeEventListener('visibilitychange', restore);
  };
}
