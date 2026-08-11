const m = require('D:/FIBEMATE/rust/lookingglass_v2/pkg/lookingglass_v2.js');

console.log('depth:', m.get_depth());
console.log('active_dim:', m.get_active_dim());
console.log('has_session before:', m.has_session());

// 构造256维输入
const input = new Uint16Array(256);
for (let i = 0; i < 256; i++) input[i] = i % 3329;

// 内置 roundtrip_test (会自己 wipe + reinit)
const rt1 = m.roundtrip_test(input);
console.log('roundtrip_test #1:', rt1);
const rt2 = m.roundtrip_test(input);
console.log('roundtrip_test #2:', rt2);

// 手工 apply_forward → apply_inverse (同session)
m.wipe_session();
m.apply_forward(new Uint16Array(1)); // force init
console.log('has_session after init:', m.has_session());

const fwd = m.apply_forward(input);
const bwd = m.apply_inverse(fwd);
let match = 0;
for (let i = 0; i < 256; i++) if (bwd[i] === input[i]) match++;
console.log('manual roundtrip:', match + '/256');
if (match < 256) {
  for (let i = 0; i < 256 && i < match + 5; i++) {
    if (bwd[i] !== input[i]) console.log('  ['+i+'] in='+input[i]+' fwd='+fwd[i]+' bwd='+bwd[i]);
  }
}

// session determinism
const fwd2 = m.apply_forward(input);
let det = 0;
for (let i = 0; i < 256; i++) if (fwd2[i] === fwd[i]) det++;
console.log('determinism:', det + '/256');

// session uniqueness
m.wipe_session();
m.apply_forward(new Uint16Array(1));
const fwd3 = m.apply_forward(input);
let uni = 0;
for (let i = 0; i < 256; i++) if (fwd3[i] !== fwd[i]) uni++;
console.log('session uniqueness:', uni + '/256 diff');

// tail passthrough
m.wipe_session();
m.apply_forward(new Uint16Array(1));
const fwd4 = m.apply_forward(input);
let tail = 0;
for (let i = 48; i < 256; i++) if (fwd4[i] === input[i]) tail++;
console.log('tail passthrough (48..255):', tail + '/208');
