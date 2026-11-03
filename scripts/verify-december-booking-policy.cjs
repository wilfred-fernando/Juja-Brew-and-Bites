const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = process.cwd();
function load(file, { date = '2080-12-10', tab = 'availability' } = {}, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  let source = fs.readFileSync(file, 'utf8');
  if (file.endsWith('BookingForm.jsx')) {
    source = source.replace('useState("availability")', `useState(${JSON.stringify(tab)})`)
      .replace('useState(() => toISODate(new Date()))', `useState(${JSON.stringify(date)})`);
  }
  const output = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }, fileName: file.replace(/\.mjs$/, '.js') }).outputText;
  const customRequire = id => {
    if (id === '@/lib/supabase/client') return { getSupabaseClient: () => ({}) };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id);
      const resolved = [base, base + '.js', base + '.jsx', base + '.mjs', base + '.ts', base + '.tsx', path.join(base, 'index.js')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!resolved) throw new Error(`Cannot resolve ${id}`);
      return load(resolved, { date, tab }, cache);
    }
    return require(id);
  };
  vm.runInThisContext('(function(require,module,exports){' + output + '\n})', { filename: file })(customRequire, module, module.exports);
  return module.exports;
}

(async () => {
  const policy = await import('../lib/bookings/decemberPolicy.mjs');
  assert.equal(policy.isDecemberBooking('2026-11-30T16:00:00Z'), true);
  assert.equal(policy.isDecemberBooking('2026-12-31T16:00:00Z'), false);
  assert.equal(policy.isDecemberBooking('2026-11-30'), false);
  const booking = { business_date: '2026-12-10', start_at: '2026-12-10T10:00:00+08:00' };
  assert.equal(policy.canRescheduleBooking(booking, null, '2026-12-07T10:00:00+08:00'), true);
  assert.equal(policy.canRescheduleBooking(booking, null, '2026-12-07T10:00:01+08:00'), false);
  assert.equal(policy.rescheduleMinimumDays({ ...booking, business_date: '2026-11-10' }), 2);
  assert.equal(policy.rescheduleMinimumDays({ ...booking, business_date: '2026-11-10' }, '2026-12-10'), 3);
  for (const date of ['2080-11-10', '2080-12-10', '2081-01-10']) {
    for (const tab of ['availability', 'book']) {
      const component = load(path.join(root, 'components/BookingForm.jsx'), { date, tab });
      const publicHtml = renderToStaticMarkup(React.createElement(component.BookingAvailabilityOnly, { initialDateISO: date }));
      const customerHtml = renderToStaticMarkup(React.createElement(component.default, { user: { id: 'test' }, member: {} }));
      for (const html of [publicHtml, customerHtml]) assert.equal(html.includes('December booking policy'), date.includes('-12-'));
      if (tab === 'book' && date.includes('-12-')) {
        assert.ok(customerHtml.indexOf('December booking policy') < customerHtml.indexOf('Submit Reservation Request'));
        assert.match(customerHtml, /3 days \(72 hours\)/);
        assert.match(customerHtml, /forfeited/);
        assert.match(customerHtml, /will not be converted/);
      }
    }
  }
  const { loadMessengerAiContext } = load(path.join(root, 'lib/messenger/context.js'));
  const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
    instructions: 'Old general guidance', reference_notes: 'Two days and GC', include_live_menu: false, include_function_room: false,
  } }) }) }) }) };
  const context = await loadMessengerAiContext(admin, { query: 'May available po ba sa December?' });
  assert.match(context.instructions, /AUTHORITATIVE DECEMBER-ONLY BOOKING POLICY/);
  assert.match(context.instructions, /3 days \(72 hours\)/);
  assert.match(context.instructions, /Proactively explain/);
  assert.match(context.instructions, /Other months retain their existing policy/);
  console.log('PASS: December-only public/customer notices, pre-submit placement, Manila month boundaries, 72-hour cutoff, other-month policy, and JujaBot authoritative context.');
})().catch(error => { console.error(error); process.exitCode = 1; });
