// Combine event bursts, never overlap requests, and retain one refresh for
// events received while a request is running. dispose() drops pending work.
export function createCoalescedRefresh(refresh, delay = 500) {
  let timer = null;
  let running = false;
  let pending = false;
  let disposed = false;
  const schedule = () => {
    if (disposed) return;
    pending = true;
    if (timer !== null || running) return;
    timer = setTimeout(async () => {
      timer = null;
      pending = false;
      running = true;
      try { await refresh(); }
      catch (error) { console.warn("Realtime refresh failed", error); }
      finally {
        running = false;
        if (pending && !disposed) schedule();
      }
    }, delay);
  };
  schedule.dispose = () => {
    disposed = true;
    clearTimeout(timer);
    timer = null;
    pending = false;
  };
  return schedule;
}
