#!/usr/bin/env node
// fix-ctrl-chars.cjs — repair first-letter control-char substitution in BUILD.md / MEMORY.md
//
// Root cause (2026-08 corruption class): literal `\a` `\b` `\f` escape sequences
// were interpreted as ASCII control bytes, replacing the FIRST letter of words:
//   0x07 (BEL,  \a)  -> 'a'
//   0x08 (BS,   \b)  -> 'b'
//   0x0C (FF,   \f)  -> 'f'
// Verified against git history:
//   MEMORY.md \f04a282  -> f04a28284 (real commit)
//   MEMORY.md \ba4cba6  -> ba4cba69e (real commit)
//   MEMORY.md \a c816b9 -> ac816b99a (real commit)
//   BUILD.md  \bash -> bash, \addon -> addon, \fpga-... -> fpga-...
const fs = require('fs');

const TARGETS = ['BUILD.md', 'MEMORY.md'];
// Map control byte -> replacement letter (ASCII code)
const REPLACE = {
  0x07: 0x61, // \a -> 'a'
  0x08: 0x62, // \b -> 'b'
  0x0c: 0x66, // \f -> 'f'
};

for (const f of TARGETS) {
  if (!fs.existsSync(f)) { console.log('skip (missing): ' + f); continue; }
  const buf = fs.readFileSync(f);
  const out = Buffer.alloc(buf.length);
  let replaced = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (REPLACE[b] !== undefined) { out[i] = REPLACE[b]; replaced++; }
    else out[i] = b;
  }
  if (replaced === 0) {
    console.log('clean (no change): ' + f);
    continue;
  }
  fs.writeFileSync(f, out);
  console.log(`fixed ${f}: replaced ${replaced} control char(s) with correct letters`);
}
