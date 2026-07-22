// SPDX-License-Identifier: GPL-3.0-only
var fib = require('../packages/pqc-kem');
function h2b(hex) { return new Uint8Array(Buffer.from(hex,'hex')); }
function b2h(b) { return Array.prototype.slice.call(b).map(function(x){return x.toString(16).padStart(2,'0');}).join(''); }

var rho = h2b('65eafd465fc64a0c5f8f3f9003489415899d59a543d8208c54a3166529b53922');

// Standard: rho || 0x00 || 0x00
var std0 = new Uint8Array(34); std0.set(rho,0); std0[32]=0; std0[33]=0;
var s0 = fib.shake128(std0, 48);
console.log('Std A[0][0]: ' + b2h(s0.slice(0,16)));

// Standard: rho || 0x01 || 0x00
var std1 = new Uint8Array(34); std1.set(rho,0); std1[32]=1; std1[33]=0;
var s1 = fib.shake128(std1, 48);
console.log('Std A[1][0]: ' + b2h(s1.slice(0,16)));
console.log('A[0][0] != A[1][0]: ' + (b2h(s0.slice(0,16)) !== b2h(s1.slice(0,16))));

// FIBEMATE samplePoly
var a00 = fib.samplePoly(rho, (0 << 8) | 0);
var a10 = fib.samplePoly(rho, (1 << 8) | 0);
console.log('FIBEMATE A[0][0] coeff[0]: ' + a00[0] + ', A[1][0] coeff[0]: ' + a10[0]);
console.log('Rows differ: ' + (a00[0] !== a10[0]));
