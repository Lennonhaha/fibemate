// End-to-end test: localhost connection to reg-server via SSH
const WebSocket = require('ws');
const crypto = require('crypto');

const WS_URL = 'ws://127.0.0.1:3080';
let tests = 0, passed = 0;

function test(name) { tests++; console.log(`\n--- ${name} ---`); return name; }
function pass(name) { passed++; console.log(`  ✅ ${name}`); }
function fail(name, msg) { console.log(`  ❌ ${name}: ${msg}`); }

function wsSend(ws, msg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    ws.once('message', (data) => { clearTimeout(timer); resolve(JSON.parse(data.toString())); });
    ws.send(JSON.stringify(msg));
  });
}

async function runTests() {
  // 1. Connect
  test('WS Connection');
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve) => ws.on('open', resolve));
  pass('connected');

  // 2. Health check (HTTP)
  const http = require('http');
  const health = await new Promise((resolve) => {
    http.get('http://127.0.0.1:3081/health', (res) => {
      let body = ''; res.on('data', d => body += d);
      res.on('end', () => resolve(JSON.parse(body)));
    });
  });
  test('Health Check');
  if (health.ok) { pass(`users=${health.users}`); } else { fail('health', JSON.stringify(health)); }

  // 3. Register Alice
  test('Register Alice');
  const aliceKey = crypto.randomBytes(32).toString('hex');
  const r1 = await wsSend(ws, { type: "register", username: 'alice', identityKey: aliceKey });
  if (r1.ok) { pass(`userId=${r1.userId}`); } else { fail('register', r1.error); }
  const aliceId = r1.userId;

  // 4. Register Bob
  test('Register Bob');
  const bobKey = crypto.randomBytes(32).toString('hex');
  const r2 = await wsSend(ws, { type: "register", username: 'bob', identityKey: bobKey });
  if (r2.ok) { pass(`userId=${r2.userId}`); } else { fail('register', r2.error); }
  const bobId = r2.userId;

  // 5. Duplicate username reject
  test('Duplicate Username Reject');
  const r3 = await wsSend(ws, { type: "register", username: 'alice', identityKey: 'fake' });
  if (!r3.ok && r3.error === 'username taken') { pass('rejected correctly'); } else { fail('duplicate', JSON.stringify(r3)); }

  // 6. Alice uploads OPKs
  test('Upload OPKs');
  const opks = Array.from({ length: 10 }, () => crypto.randomBytes(32).toString('hex'));
  const r4 = await wsSend(ws, { type: 'upload-opk', userId: aliceId, opks });
  if (r4.ok && r4.count === 10) { pass(`count=${r4.count}`); } else { fail('upload', JSON.stringify(r4)); }

  // 7. Bob fetches Alice's OPK
  test('Fetch OPK');
  const r5 = await wsSend(ws, { type: 'fetch-opk', userId: aliceId });
  if (r5.ok && r5.opk === opks[0]) { pass('opk matches'); } else { fail('fetch', JSON.stringify(r5)); }

  // 8. Second fetch gets next OPK
  test('Fetch OPK (consume)');
  const r5b = await wsSend(ws, { type: 'fetch-opk', userId: aliceId });
  if (r5b.ok && r5b.opk === opks[1]) { pass('opk matches (2nd)'); } else { fail('fetch2', JSON.stringify(r5b)); }

  // 9. Bob sends encrypted message to Alice
  test('Send Message');
  const ciphertext = 'encrypted:' + crypto.randomBytes(64).toString('base64');
  const r6 = await wsSend(ws, { type: 'send', from: bobId, to: aliceId, ciphertext });
  if (r6.ok) { pass(`msgId=${r6.msgId}`); } else { fail('send', JSON.stringify(r6)); }

  // 10. Alice polls inbox
  test('Poll Inbox');
  const r7 = await wsSend(ws, { type: 'poll', userId: aliceId });
  if (r7.ok && r7.messages.length === 1 && r7.messages[0].ciphertext === ciphertext) {
    pass(`received 1 message from ${r7.messages[0].from}`);
  } else { fail('poll', JSON.stringify(r7)); }

  // 11. Second poll returns empty
  test('Poll Inbox (empty)');
  const r8 = await wsSend(ws, { type: 'poll', userId: aliceId });
  if (r8.ok && r8.messages.length === 0) { pass('empty after drain'); } else { fail('poll2', JSON.stringify(r8)); }

  // Summary
  console.log(`\n=== ${passed}/${tests} PASS ===`);
  ws.close();
  process.exit(passed === tests ? 0 : 1);
}

runTests().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
