import { sm3Hash } from './build/sm3.js';

function hashStr(s) {
  const b = Uint8Array.from(s.split('').map(c => c.charCodeAt(0)));
  const arr = new Array(b.length);
  for (let i = 0; i < b.length; i++) arr[i] = b[i];
  const r = sm3Hash(arr, b.length);
  let hex = '';
  for (let i = 0; i < r.length; i++) hex += r[i].toString(16).padStart(2, '0');
  return hex;
}

const cases = [
  ['abc', '66c7f0f462eeedd9d1f2d46bdc10e4e24167c4875cf2f7a2297da02b8f4ba8e0'],
  ['', '1ab21d8355cfa17f8e61194831e81a8f22bec8c728fefb747ed035eb5082aa2b'],
];

let pass = 0, fail = 0;
for (const [input, want] of cases) {
  const got = hashStr(input);
  if (got === want) { pass++; console.log('PASS', JSON.stringify(input)); }
  else { fail++; console.log('FAIL', JSON.stringify(input), '\n  got ', got, '\n  want', want); }
}
console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
