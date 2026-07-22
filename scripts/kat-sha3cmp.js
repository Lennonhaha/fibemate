// SPDX-License-Identifier: GPL-3.0-only
#!/usr/bin/env node
var jsSha3 = require('js-sha3');
var d = new Uint8Array(Buffer.from('7c9935a0b07694aa0c6d10e4db6b1add2fd81a25ccb148032dcd739936737f2d','hex'));
var ref = jsSha3.sha3_512(d);
console.log('ref sha3_512(d): ' + ref);

// FIBEMATE sha3
var fib = require('../packages/pqc-kem');
var d2 = fib.sha3_512(d);
var fibHex = Array.prototype.slice.call(d2).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
console.log('fib sha3_512(d): ' + fibHex);
