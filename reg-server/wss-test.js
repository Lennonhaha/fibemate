// SPDX-License-Identifier: GPL-3.0-only
const ws = require('ws');
const w = new ws('wss://fibemate.net/reg/ws', { rejectUnauthorized: false });
w.on('open', () => {
  w.send(JSON.stringify({ type: 'register', username: 'e2ewss', identityKey: 'testkey1111111111111111111111111111111111111111111111111111111111111111' }));
});
w.on('message', (d) => {
  console.log(JSON.stringify(JSON.parse(d.toString())));
  w.close();
  setTimeout(() => process.exit(0), 100);
});
w.on('error', (e) => { console.log('ERROR:' + e.message); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);
