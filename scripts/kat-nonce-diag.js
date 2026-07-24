#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
var jsSha3 = require('js-sha3');
var fib = require('../packages/pqc-kem');

function h2b(hex) {
    return new Uint8Array(Buffer.from(hex,'hex'));
}

function b2h(b) {
    return Array.prototype.slice.call(b).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
}

// rho from Jasmin KAT (first 32 bytes of sha3_512(d))
var rho = h2b('65eafd465fc64a0c5f8f3f9003489415899d59a543d8208c54a3166529b53922');

// Test: SHAKE128(rho || [0x00, 0x00])  (NIST standard: i=0, j=0)
// vs   SHAKE128(rho || [0x00])        (FIBEMATE: truncated nonce)

// FIBEMATE way: single byte nonce
var fib_nonce_0 = new Uint8Array(33);
fib_nonce_0.set(rho, 0);
fib_nonce_0[32] = 0;
var stream_fib = fib.shake128(fib_nonce_0, 48);
console.log('FIBEMATE shake128(rho||0x00): ' + b2h(stream_fib.slice(0,16)));

// Standard way: two bytes nonce (i=0,j=0)
var std_nonce_00 = new Uint8Array(34);
std_nonce_00.set(rho, 0);
std_nonce_00[32] = 0;  // i
std_nonce_00[33] = 0;  // j
var stream_std = fib.shake128(std_nonce_00, 48);
console.log('Standard shake128(rho||0||0): ' + b2h(stream_std.slice(0,16)));
console.log('Match: ' + (b2h(stream_fib.slice(0,16)) === b2h(stream_std.slice(0,16))));

// For A[1][0]: standard = rho||1||0, FIBEMATE = rho||256 (truncated to 0!)
// Standard
var std_nonce_10 = new Uint8Array(34);
std_nonce_10.set(rho, 0);
std_nonce_10[32] = 1;  // i=1
std_nonce_10[33] = 0;  // j=0
var stream_10_std = fib.shake128(std_nonce_10, 48);
console.log('Std shake128(rho||1||0): ' + b2h(stream_10_std.slice(0,16)));

// FIBEMATE: nonce = (1<<8)|0 = 256, Uint8Array truncates to 0
var fib_nonce_256 = new Uint8Array(33);
fib_nonce_256.set(rho, 0);
fib_nonce_256[32] = 0;  // 256 & 0xFF = 0
var stream_10_fib = fib.shake128(fib_nonce_256, 48);
console.log('FIBEMATE shake128(rho||0): ' + b2h(stream_10_fib.slice(0,16)));
console.log('A[1][0] Match: ' + (b2h(stream_10_std.slice(0,16)) === b2h(stream_10_fib.slice(0,16))));

// Check: A[1][0] == A[0][0]? (FIBEMATE would make them identical!)
console.log('FIBEMATE A[0][0]==A[1][0]: ' + (b2h(stream_fib.slice(0,16)) === b2h(stream_10_fib.slice(0,16))));
