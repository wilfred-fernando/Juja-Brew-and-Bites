const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

async function main() {
  const { validateGcPurchase } = await import('../lib/giftCertificatePurchase.js');
  const { cancellationGiftEmail } = await import('../lib/bookings/cancellationGiftEmail.js');
  const user = randomUUID();
  const storage = 'https://files.example.test';
  const input = { request_key: randomUUID(), customer_name: '  Juan Dela Cruz  ', customer_email: 'Juan@Example.com ',
    quantity: 2, source: 'website', payment_method: 'QRPH', payment_proof_url: `${storage}/payment-proofs/${user}/test.png` };
  const validate = changes => validateGcPurchase({ ...input, ...changes }, user, storage);
  assert.equal(validate({}).customer_name, 'Juan Dela Cruz');
  assert.equal(validate({}).customer_email, 'juan@example.com');
  for (const changes of [
    { customer_name: '' }, { customer_name: 'Juan\nInjected' }, { customer_email: '' },
    { customer_email: 'juan@example.com,other@example.com' }, { quantity: 0 }, { quantity: 1.5 }, { quantity: 11 },
    { payment_method: 'Cash' }, { source: 'other' }, { payment_proof_url: null },
    { payment_proof_url: `${storage}/payment-proofs/${randomUUID()}/test.png` },
    { payment_proof_url: `https://attacker.test/payment-proofs/${user}/test.png` },
    { payment_proof_url: `${storage}/payment-proofs/${user}/test.png?redirect=bad` },
    { payment_proof_url: `${storage}/payment-proofs/${user}/../../test.png` },
    { payment_proof_url: `${storage}/payment-proofs/${user}/test.html` },
    { source: 'pos', store_id: 'branch', payment_method: 'Cash', cash_received: false },
  ]) assert.throws(() => validate(changes), undefined, JSON.stringify(changes));
  assert.equal(validate({ source: 'pos', store_id: 'branch', payment_method: 'Cash', cash_received: true }).payment_proof_url, null);
  const draft = cancellationGiftEmail({ purchase_id: 'PURCHASE-SAMPLE', customer_name: 'Juan Dela Cruz', amount: 200,
    expires_at: '2027-03-12T16:00:00Z' }, [{ code: 'SAMPLE-1' }, { code: 'SAMPLE-2' }]);
  assert.match(draft.text, /purchase .* has been approved/);
  assert.match(draft.text, /Valid until: Mar 12, 2027/);
  assert.doesNotMatch(draft.text, /reservation fee|cancelled|90 days|undefined/);
  console.log('PASS: required customer details, quantity limits, payment restrictions, proof ownership/origin, cash confirmation, six-month purchase email draft. No email sent.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
