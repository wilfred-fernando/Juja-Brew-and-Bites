import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const hash = token => createHash('sha256').update(token).digest('hex');
const bearer = req => (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req) {
  try {
    const token = bearer(req);
    if (!token) return json({ error: 'Staff login required.' }, 401);
    const admin = adminClient();
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user) return json({ error: 'Staff login required.' }, 401);
    let sessionId;
    try { sessionId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).session_id; } catch { /* Invalid verified session payload. */ }
    if (!uuid(sessionId)) return json({ error: 'Staff session required.' }, 401);
    const { deviceId, storeId } = await req.json();
    if (!uuid(deviceId) || !uuid(storeId)) return json({ error: 'Select a valid device and branch.' }, 400);
    const { data: profile, error: profileError } = await admin.from('profiles').select('role,store_id').eq('id', auth.user.id).maybeSingle();
    const role = String(profile?.role || '').toLowerCase();
    if (profileError || !['cashier','admin','super_admin'].includes(role) || (role === 'cashier' && String(profile.store_id) !== storeId)) return json({ error: 'Wrong POS branch or staff role.' }, 403);
    const { data: store, error: storeError } = await admin.from('stores').select('id').eq('id', storeId).maybeSingle();
    if (storeError || !store) return json({ error: 'Branch not found.' }, 400);
    const widgetToken = randomBytes(32).toString('base64url');
    const { error } = await admin.from('pos_booking_widget_devices').upsert({ device_id: deviceId, user_id: auth.user.id, session_id: sessionId, store_id: storeId,
      token_hash: hash(widgetToken), expires_at: new Date(Date.now() + 30 * 86400000).toISOString(), updated_at: new Date().toISOString() });
    if (error) throw error;
    return json({ token: widgetToken });
  } catch { return json({ error: 'Unable to connect the booking widget.' }, 500); }
}

export async function GET(req) {
  try {
    const token = bearer(req);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ error: 'Open POS to reconnect the widget.' }, 401);
    const { data, error } = await adminClient().rpc('read_pos_booking_widget', { p_token_hash: hash(token) });
    if (error) throw error;
    return data ? json(data) : json({ error: 'Open POS to reconnect the widget.' }, 401);
  } catch { return json({ error: 'Booking refresh unavailable.' }, 503); }
}

export async function DELETE(req) {
  try {
    const token = bearer(req);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({ success: true });
    const { error } = await adminClient().from('pos_booking_widget_devices').delete().eq('token_hash', hash(token));
    if (error) throw error;
    return json({ success: true });
  } catch { return json({ error: 'Unable to disconnect widget.' }, 503); }
}
