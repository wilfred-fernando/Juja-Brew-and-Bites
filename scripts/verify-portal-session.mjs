import assert from 'node:assert/strict';
import { getStableSession, maintainPortalSession } from '../lib/supabase/session.js';
const session = { user: { id: 'test' } };
let calls = 0;
const recovering = { auth: { getSession: async () => ++calls === 1
  ? { data: {}, error: new Error('Offline') }
  : { data: { session }, error: null } } };
assert.equal((await getStableSession(recovering, { attempts: 2, delayMs: 0 })).session, session);
const events = new Map();
const target = { addEventListener: (name, handler) => events.set(name, handler), removeEventListener: name => events.delete(name) };
const document = { ...target, hidden: false };
let starts = 0;
const client = { auth: { startAutoRefresh: () => { starts++; }, getSession: async () => ({ data: { session }, error: null }) } };
const cleanup = maintainPortalSession(client, target, document);
await new Promise(resolve => setTimeout(resolve, 0));
document.hidden = true;
await events.get('visibilitychange')();
assert.equal(starts, 1);
document.hidden = false;
await events.get('visibilitychange')();
await events.get('online')();
assert.equal(starts, 3);
cleanup();
assert.equal(events.size, 0);
console.log('PASS: transient failures retry, foreground/reconnection refresh, cleanup');
