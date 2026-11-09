const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = process.cwd();
function load(file, locked, cache = new Map()) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  let source = fs.readFileSync(file, 'utf8');
  if (file === path.join(root, 'app/admin/bookings/page.jsx')) {
    const booking = { id: '11111111-1111-4111-8111-111111111111', customer_name: 'Render Test', business_date: '2088-04-10', start_at: '2088-04-10T10:00:00+08:00', status: 'confirmed', payment_status: 'approved', payment_method: 'QRPH', deposit_amount: locked ? 1000 : 0 };
    const edit = { booking, customer_name: booking.customer_name, event_type: 'Test', guest_count: 1, contact_number: '0000000000', email: 'rollback@example.invalid', package_id: 1, extension_hours: 0, dateISO: booking.business_date, hour: 10, payment_method: 'QRPH', deposit_amount: booking.deposit_amount, reservation_fee_locked: locked };
    source = source.replace('const [editModal, setEditModal] = useState(null);', `const [editModal, setEditModal] = useState(${JSON.stringify(edit)});`)
      .replace('const [loading, setLoading] = useState(true);', 'const [loading, setLoading] = useState(false);');
  }
  const transpiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true, fileName: file.replace(/\.mjs$/, '.js') });
  assert.equal(transpiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, file);
  const customRequire = id => {
    if (id === '@/lib/supabase/client') return { getSupabaseClient: () => ({}) };
    if (id.startsWith('@/components/')) return { __esModule: true, default: () => null };
    if (id.startsWith('@/') || id.startsWith('.')) {
      const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id);
      const resolved = [base, base + '.js', base + '.jsx', base + '.mjs', path.join(base, 'index.js')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!resolved) throw new Error('Cannot resolve ' + id);
      return load(resolved, locked, cache);
    }
    return require(id);
  };
  vm.runInThisContext('(function(require,module,exports){' + transpiled.outputText + '\n})', { filename: file })(customRequire, module, module.exports);
  return module.exports;
}

for (const locked of [false, true]) {
  const component = load(path.join(root, 'app/admin/bookings/page.jsx'), locked).default;
  const html = renderToStaticMarkup(React.createElement(component));
  assert.match(html, /Reservation Fee Amount/);
  const amount = html.match(/<input[^>]+id="edit-reservation-amount"[^>]*>/)?.[0];
  const method = html.match(/<select[^>]+id="edit-reservation-payment"[^>]*>/)?.[0];
  assert.ok(amount && method); assert.equal(/\sdisabled(?:=|\s|>)/.test(amount), locked); assert.equal(/\sdisabled(?:=|\s|>)/.test(method), locked);
  assert.ok(amount.includes(`value="${locked ? 1000 : 0}"`));
}
const route = fs.readFileSync('app/api/admin/booking-confirmation/route.js', 'utf8');
const compiled = ts.transpileModule(route, { compilerOptions: { target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
console.log('PASS: actual Admin booking editor renders amount, permits zero-fee correction, locks collected amount/payment method, and route syntax passes.');
