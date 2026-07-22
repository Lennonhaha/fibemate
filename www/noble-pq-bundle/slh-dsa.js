// SPDX-License-Identifier: GPL-3.0-only
var __NOBLE_PQ__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // node_modules/@noble/post-quantum/slh-dsa.js
  var slh_dsa_exports = {};
  __export(slh_dsa_exports, {
    PARAMS: () => PARAMS,
    slh_dsa_sha2_128f: () => slh_dsa_sha2_128f,
    slh_dsa_sha2_128s: () => slh_dsa_sha2_128s,
    slh_dsa_sha2_192f: () => slh_dsa_sha2_192f,
    slh_dsa_sha2_192s: () => slh_dsa_sha2_192s,
    slh_dsa_sha2_256f: () => slh_dsa_sha2_256f,
    slh_dsa_sha2_256s: () => slh_dsa_sha2_256s,
    slh_dsa_shake_128f: () => slh_dsa_shake_128f,
    slh_dsa_shake_128s: () => slh_dsa_shake_128s,
    slh_dsa_shake_192f: () => slh_dsa_shake_192f,
    slh_dsa_shake_192s: () => slh_dsa_shake_192s,
    slh_dsa_shake_256f: () => slh_dsa_shake_256f,
    slh_dsa_shake_256s: () => slh_dsa_shake_256s
  });

  // node_modules/@noble/hashes/utils.js
  function isBytes(a) {
    return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
  }
  function anumber(n, title = "") {
    if (typeof n !== "number") {
      const prefix = title && `"${title}" `;
      throw new TypeError(`${prefix}expected number, got ${typeof n}`);
    }
    if (!Number.isSafeInteger(n) || n < 0) {
      const prefix = title && `"${title}" `;
      throw new RangeError(`${prefix}expected integer >= 0, got ${n}`);
    }
  }
  function abytes(value, length, title = "") {
    const bytes = isBytes(value);
    const len = value?.length;
    const needsLen = length !== void 0;
    if (!bytes || needsLen && len !== length) {
      const prefix = title && `"${title}" `;
      const ofLen = needsLen ? ` of length ${length}` : "";
      const got = bytes ? `length=${len}` : `type=${typeof value}`;
      const message = prefix + "expected Uint8Array" + ofLen + ", got " + got;
      if (!bytes)
        throw new TypeError(message);
      throw new RangeError(message);
    }
    return value;
  }
  function ahash(h) {
    if (typeof h !== "function" || typeof h.create !== "function")
      throw new TypeError("Hash must wrapped by utils.createHasher");
    anumber(h.outputLen);
    anumber(h.blockLen);
    if (h.outputLen < 1)
      throw new Error('"outputLen" must be >= 1');
    if (h.blockLen < 1)
      throw new Error('"blockLen" must be >= 1');
  }
  function aexists(instance, checkFinished = true) {
    if (instance.destroyed)
      throw new Error("Hash instance has been destroyed");
    if (checkFinished && instance.finished)
      throw new Error("Hash#digest() has already been called");
  }
  function aoutput(out, instance) {
    abytes(out, void 0, "digestInto() output");
    const min = instance.outputLen;
    if (out.length < min) {
      throw new RangeError('"digestInto() output" expected to be of length >=' + min);
    }
  }
  function u32(arr) {
    return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
  }
  function clean(...arrays) {
    for (let i = 0; i < arrays.length; i++) {
      arrays[i].fill(0);
    }
  }
  function createView(arr) {
    return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  }
  function rotr(word, shift) {
    return word << 32 - shift | word >>> shift;
  }
  var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
  function byteSwap(word) {
    return word << 24 & 4278190080 | word << 8 & 16711680 | word >>> 8 & 65280 | word >>> 24 & 255;
  }
  function byteSwap32(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = byteSwap(arr[i]);
    }
    return arr;
  }
  var swap32IfBE = isLE ? (u) => u : byteSwap32;
  var hasHexBuiltin = /* @__PURE__ */ (() => (
    // @ts-ignore
    typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
  ))();
  var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
  function bytesToHex(bytes) {
    abytes(bytes);
    if (hasHexBuiltin)
      return bytes.toHex();
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += hexes[bytes[i]];
    }
    return hex;
  }
  var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
  function asciiToBase16(ch) {
    if (ch >= asciis._0 && ch <= asciis._9)
      return ch - asciis._0;
    if (ch >= asciis.A && ch <= asciis.F)
      return ch - (asciis.A - 10);
    if (ch >= asciis.a && ch <= asciis.f)
      return ch - (asciis.a - 10);
    return;
  }
  function hexToBytes(hex) {
    if (typeof hex !== "string")
      throw new TypeError("hex string expected, got " + typeof hex);
    if (hasHexBuiltin) {
      try {
        return Uint8Array.fromHex(hex);
      } catch (error) {
        if (error instanceof SyntaxError)
          throw new RangeError(error.message);
        throw error;
      }
    }
    const hl = hex.length;
    const al = hl / 2;
    if (hl % 2)
      throw new RangeError("hex string expected, got unpadded hex of length " + hl);
    const array = new Uint8Array(al);
    for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
      const n1 = asciiToBase16(hex.charCodeAt(hi));
      const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
      if (n1 === void 0 || n2 === void 0) {
        const char = hex[hi] + hex[hi + 1];
        throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
      }
      array[ai] = n1 * 16 + n2;
    }
    return array;
  }
  function concatBytes(...arrays) {
    let sum = 0;
    for (let i = 0; i < arrays.length; i++) {
      const a = arrays[i];
      abytes(a);
      sum += a.length;
    }
    const res = new Uint8Array(sum);
    for (let i = 0, pad = 0; i < arrays.length; i++) {
      const a = arrays[i];
      res.set(a, pad);
      pad += a.length;
    }
    return res;
  }
  function createHasher(hashCons, info = {}) {
    const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
    const tmp = hashCons(void 0);
    hashC.outputLen = tmp.outputLen;
    hashC.blockLen = tmp.blockLen;
    hashC.canXOF = tmp.canXOF;
    hashC.create = (opts) => hashCons(opts);
    Object.assign(hashC, info);
    return Object.freeze(hashC);
  }
  function randomBytes(bytesLength = 32) {
    anumber(bytesLength, "bytesLength");
    const cr = typeof globalThis === "object" ? globalThis.crypto : null;
    if (typeof cr?.getRandomValues !== "function")
      throw new Error("crypto.getRandomValues must be defined");
    if (bytesLength > 65536)
      throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
    return cr.getRandomValues(new Uint8Array(bytesLength));
  }
  var oidNist = (suffix) => ({
    // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
    // Larger suffix values would need base-128 OID encoding and a different length byte.
    oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
  });

  // node_modules/@noble/hashes/hmac.js
  var _HMAC = class {
    oHash;
    iHash;
    blockLen;
    outputLen;
    canXOF = false;
    finished = false;
    destroyed = false;
    constructor(hash, key) {
      ahash(hash);
      abytes(key, void 0, "key");
      this.iHash = hash.create();
      if (typeof this.iHash.update !== "function")
        throw new Error("Expected instance of class which extends utils.Hash");
      this.blockLen = this.iHash.blockLen;
      this.outputLen = this.iHash.outputLen;
      const blockLen = this.blockLen;
      const pad = new Uint8Array(blockLen);
      pad.set(key.length > blockLen ? hash.create().update(key).digest() : key);
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54;
      this.iHash.update(pad);
      this.oHash = hash.create();
      for (let i = 0; i < pad.length; i++)
        pad[i] ^= 54 ^ 92;
      this.oHash.update(pad);
      clean(pad);
    }
    update(buf) {
      aexists(this);
      this.iHash.update(buf);
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const buf = out.subarray(0, this.outputLen);
      this.iHash.digestInto(buf);
      this.oHash.update(buf);
      this.oHash.digestInto(buf);
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.oHash.outputLen);
      this.digestInto(out);
      return out;
    }
    _cloneInto(to) {
      to ||= Object.create(Object.getPrototypeOf(this), {});
      const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
      to = to;
      to.finished = finished;
      to.destroyed = destroyed;
      to.blockLen = blockLen;
      to.outputLen = outputLen;
      to.oHash = oHash._cloneInto(to.oHash);
      to.iHash = iHash._cloneInto(to.iHash);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
    destroy() {
      this.destroyed = true;
      this.oHash.destroy();
      this.iHash.destroy();
    }
  };
  var hmac = /* @__PURE__ */ (() => {
    const hmac_ = ((hash, key, message) => new _HMAC(hash, key).update(message).digest());
    hmac_.create = (hash, key) => new _HMAC(hash, key);
    return hmac_;
  })();

  // node_modules/@noble/hashes/_md.js
  function Chi(a, b, c) {
    return a & b ^ ~a & c;
  }
  function Maj(a, b, c) {
    return a & b ^ a & c ^ b & c;
  }
  var HashMD = class {
    blockLen;
    outputLen;
    canXOF = false;
    padOffset;
    isLE;
    // For partial updates less than block size
    buffer;
    view;
    finished = false;
    length = 0;
    pos = 0;
    destroyed = false;
    constructor(blockLen, outputLen, padOffset, isLE2) {
      this.blockLen = blockLen;
      this.outputLen = outputLen;
      this.padOffset = padOffset;
      this.isLE = isLE2;
      this.buffer = new Uint8Array(blockLen);
      this.view = createView(this.buffer);
    }
    update(data) {
      aexists(this);
      abytes(data);
      const { view, buffer, blockLen } = this;
      const len = data.length;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        if (take === blockLen) {
          const dataView = createView(data);
          for (; blockLen <= len - pos; pos += blockLen)
            this.process(dataView, pos);
          continue;
        }
        buffer.set(data.subarray(pos, pos + take), this.pos);
        this.pos += take;
        pos += take;
        if (this.pos === blockLen) {
          this.process(view, 0);
          this.pos = 0;
        }
      }
      this.length += data.length;
      this.roundClean();
      return this;
    }
    digestInto(out) {
      aexists(this);
      aoutput(out, this);
      this.finished = true;
      const { buffer, view, blockLen, isLE: isLE2 } = this;
      let { pos } = this;
      buffer[pos++] = 128;
      clean(this.buffer.subarray(pos));
      if (this.padOffset > blockLen - pos) {
        this.process(view, 0);
        pos = 0;
      }
      for (let i = pos; i < blockLen; i++)
        buffer[i] = 0;
      view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE2);
      this.process(view, 0);
      const oview = createView(out);
      const len = this.outputLen;
      if (len % 4)
        throw new Error("_sha2: outputLen must be aligned to 32bit");
      const outLen = len / 4;
      const state = this.get();
      if (outLen > state.length)
        throw new Error("_sha2: outputLen bigger than state");
      for (let i = 0; i < outLen; i++)
        oview.setUint32(4 * i, state[i], isLE2);
    }
    digest() {
      const { buffer, outputLen } = this;
      this.digestInto(buffer);
      const res = buffer.slice(0, outputLen);
      this.destroy();
      return res;
    }
    _cloneInto(to) {
      to ||= new this.constructor();
      to.set(...this.get());
      const { blockLen, buffer, length, finished, destroyed, pos } = this;
      to.destroyed = destroyed;
      to.finished = finished;
      to.length = length;
      to.pos = pos;
      if (length % blockLen)
        to.buffer.set(buffer);
      return to;
    }
    clone() {
      return this._cloneInto();
    }
  };
  var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    3144134277,
    1013904242,
    2773480762,
    1359893119,
    2600822924,
    528734635,
    1541459225
  ]);
  var SHA512_IV = /* @__PURE__ */ Uint32Array.from([
    1779033703,
    4089235720,
    3144134277,
    2227873595,
    1013904242,
    4271175723,
    2773480762,
    1595750129,
    1359893119,
    2917565137,
    2600822924,
    725511199,
    528734635,
    4215389547,
    1541459225,
    327033209
  ]);

  // node_modules/@noble/hashes/_u64.js
  var U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
  var _32n = /* @__PURE__ */ BigInt(32);
  function fromBig(n, le = false) {
    if (le)
      return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
    return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
  }
  function split(lst, le = false) {
    const len = lst.length;
    let Ah = new Uint32Array(len);
    let Al = new Uint32Array(len);
    for (let i = 0; i < len; i++) {
      const { h, l } = fromBig(lst[i], le);
      [Ah[i], Al[i]] = [h, l];
    }
    return [Ah, Al];
  }
  var shrSH = (h, _l, s) => h >>> s;
  var shrSL = (h, l, s) => h << 32 - s | l >>> s;
  var rotrSH = (h, l, s) => h >>> s | l << 32 - s;
  var rotrSL = (h, l, s) => h << 32 - s | l >>> s;
  var rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
  var rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
  var rotlSH = (h, l, s) => h << s | l >>> 32 - s;
  var rotlSL = (h, l, s) => l << s | h >>> 32 - s;
  var rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
  var rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
  function add(Ah, Al, Bh, Bl) {
    const l = (Al >>> 0) + (Bl >>> 0);
    return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
  }
  var add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
  var add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
  var add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
  var add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
  var add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
  var add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;

  // node_modules/@noble/hashes/sha2.js
  var SHA256_K = /* @__PURE__ */ Uint32Array.from([
    1116352408,
    1899447441,
    3049323471,
    3921009573,
    961987163,
    1508970993,
    2453635748,
    2870763221,
    3624381080,
    310598401,
    607225278,
    1426881987,
    1925078388,
    2162078206,
    2614888103,
    3248222580,
    3835390401,
    4022224774,
    264347078,
    604807628,
    770255983,
    1249150122,
    1555081692,
    1996064986,
    2554220882,
    2821834349,
    2952996808,
    3210313671,
    3336571891,
    3584528711,
    113926993,
    338241895,
    666307205,
    773529912,
    1294757372,
    1396182291,
    1695183700,
    1986661051,
    2177026350,
    2456956037,
    2730485921,
    2820302411,
    3259730800,
    3345764771,
    3516065817,
    3600352804,
    4094571909,
    275423344,
    430227734,
    506948616,
    659060556,
    883997877,
    958139571,
    1322822218,
    1537002063,
    1747873779,
    1955562222,
    2024104815,
    2227730452,
    2361852424,
    2428436474,
    2756734187,
    3204031479,
    3329325298
  ]);
  var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
  var SHA2_32B = class extends HashMD {
    constructor(outputLen) {
      super(64, outputLen, 8, false);
    }
    get() {
      const { A, B, C, D, E, F, G, H } = this;
      return [A, B, C, D, E, F, G, H];
    }
    // prettier-ignore
    set(A, B, C, D, E, F, G, H) {
      this.A = A | 0;
      this.B = B | 0;
      this.C = C | 0;
      this.D = D | 0;
      this.E = E | 0;
      this.F = F | 0;
      this.G = G | 0;
      this.H = H | 0;
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4)
        SHA256_W[i] = view.getUint32(offset, false);
      for (let i = 16; i < 64; i++) {
        const W15 = SHA256_W[i - 15];
        const W2 = SHA256_W[i - 2];
        const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
        const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
        SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
      }
      let { A, B, C, D, E, F, G, H } = this;
      for (let i = 0; i < 64; i++) {
        const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
        const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
        const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
        const T2 = sigma0 + Maj(A, B, C) | 0;
        H = G;
        G = F;
        F = E;
        E = D + T1 | 0;
        D = C;
        C = B;
        B = A;
        A = T1 + T2 | 0;
      }
      A = A + this.A | 0;
      B = B + this.B | 0;
      C = C + this.C | 0;
      D = D + this.D | 0;
      E = E + this.E | 0;
      F = F + this.F | 0;
      G = G + this.G | 0;
      H = H + this.H | 0;
      this.set(A, B, C, D, E, F, G, H);
    }
    roundClean() {
      clean(SHA256_W);
    }
    destroy() {
      this.destroyed = true;
      this.set(0, 0, 0, 0, 0, 0, 0, 0);
      clean(this.buffer);
    }
  };
  var _SHA256 = class extends SHA2_32B {
    // We cannot use array here since array allows indexing by variable
    // which means optimizer/compiler cannot use registers.
    A = SHA256_IV[0] | 0;
    B = SHA256_IV[1] | 0;
    C = SHA256_IV[2] | 0;
    D = SHA256_IV[3] | 0;
    E = SHA256_IV[4] | 0;
    F = SHA256_IV[5] | 0;
    G = SHA256_IV[6] | 0;
    H = SHA256_IV[7] | 0;
    constructor() {
      super(32);
    }
  };
  var K512 = /* @__PURE__ */ (() => split([
    "0x428a2f98d728ae22",
    "0x7137449123ef65cd",
    "0xb5c0fbcfec4d3b2f",
    "0xe9b5dba58189dbbc",
    "0x3956c25bf348b538",
    "0x59f111f1b605d019",
    "0x923f82a4af194f9b",
    "0xab1c5ed5da6d8118",
    "0xd807aa98a3030242",
    "0x12835b0145706fbe",
    "0x243185be4ee4b28c",
    "0x550c7dc3d5ffb4e2",
    "0x72be5d74f27b896f",
    "0x80deb1fe3b1696b1",
    "0x9bdc06a725c71235",
    "0xc19bf174cf692694",
    "0xe49b69c19ef14ad2",
    "0xefbe4786384f25e3",
    "0x0fc19dc68b8cd5b5",
    "0x240ca1cc77ac9c65",
    "0x2de92c6f592b0275",
    "0x4a7484aa6ea6e483",
    "0x5cb0a9dcbd41fbd4",
    "0x76f988da831153b5",
    "0x983e5152ee66dfab",
    "0xa831c66d2db43210",
    "0xb00327c898fb213f",
    "0xbf597fc7beef0ee4",
    "0xc6e00bf33da88fc2",
    "0xd5a79147930aa725",
    "0x06ca6351e003826f",
    "0x142929670a0e6e70",
    "0x27b70a8546d22ffc",
    "0x2e1b21385c26c926",
    "0x4d2c6dfc5ac42aed",
    "0x53380d139d95b3df",
    "0x650a73548baf63de",
    "0x766a0abb3c77b2a8",
    "0x81c2c92e47edaee6",
    "0x92722c851482353b",
    "0xa2bfe8a14cf10364",
    "0xa81a664bbc423001",
    "0xc24b8b70d0f89791",
    "0xc76c51a30654be30",
    "0xd192e819d6ef5218",
    "0xd69906245565a910",
    "0xf40e35855771202a",
    "0x106aa07032bbd1b8",
    "0x19a4c116b8d2d0c8",
    "0x1e376c085141ab53",
    "0x2748774cdf8eeb99",
    "0x34b0bcb5e19b48a8",
    "0x391c0cb3c5c95a63",
    "0x4ed8aa4ae3418acb",
    "0x5b9cca4f7763e373",
    "0x682e6ff3d6b2b8a3",
    "0x748f82ee5defb2fc",
    "0x78a5636f43172f60",
    "0x84c87814a1f0ab72",
    "0x8cc702081a6439ec",
    "0x90befffa23631e28",
    "0xa4506cebde82bde9",
    "0xbef9a3f7b2c67915",
    "0xc67178f2e372532b",
    "0xca273eceea26619c",
    "0xd186b8c721c0c207",
    "0xeada7dd6cde0eb1e",
    "0xf57d4f7fee6ed178",
    "0x06f067aa72176fba",
    "0x0a637dc5a2c898a6",
    "0x113f9804bef90dae",
    "0x1b710b35131c471b",
    "0x28db77f523047d84",
    "0x32caab7b40c72493",
    "0x3c9ebe0a15c9bebc",
    "0x431d67c49c100d4c",
    "0x4cc5d4becb3e42b6",
    "0x597f299cfc657e2a",
    "0x5fcb6fab3ad6faec",
    "0x6c44198c4a475817"
  ].map((n) => BigInt(n))))();
  var SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
  var SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
  var SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
  var SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
  var SHA2_64B = class extends HashMD {
    constructor(outputLen) {
      super(128, outputLen, 16, false);
    }
    // prettier-ignore
    get() {
      const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
      return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
    }
    // prettier-ignore
    set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
      this.Ah = Ah | 0;
      this.Al = Al | 0;
      this.Bh = Bh | 0;
      this.Bl = Bl | 0;
      this.Ch = Ch | 0;
      this.Cl = Cl | 0;
      this.Dh = Dh | 0;
      this.Dl = Dl | 0;
      this.Eh = Eh | 0;
      this.El = El | 0;
      this.Fh = Fh | 0;
      this.Fl = Fl | 0;
      this.Gh = Gh | 0;
      this.Gl = Gl | 0;
      this.Hh = Hh | 0;
      this.Hl = Hl | 0;
    }
    process(view, offset) {
      for (let i = 0; i < 16; i++, offset += 4) {
        SHA512_W_H[i] = view.getUint32(offset);
        SHA512_W_L[i] = view.getUint32(offset += 4);
      }
      for (let i = 16; i < 80; i++) {
        const W15h = SHA512_W_H[i - 15] | 0;
        const W15l = SHA512_W_L[i - 15] | 0;
        const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
        const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
        const W2h = SHA512_W_H[i - 2] | 0;
        const W2l = SHA512_W_L[i - 2] | 0;
        const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
        const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
        const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
        const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
        SHA512_W_H[i] = SUMh | 0;
        SHA512_W_L[i] = SUMl | 0;
      }
      let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
      for (let i = 0; i < 80; i++) {
        const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
        const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
        const CHIh = Eh & Fh ^ ~Eh & Gh;
        const CHIl = El & Fl ^ ~El & Gl;
        const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
        const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
        const T1l = T1ll | 0;
        const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
        const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
        const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
        const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
        Hh = Gh | 0;
        Hl = Gl | 0;
        Gh = Fh | 0;
        Gl = Fl | 0;
        Fh = Eh | 0;
        Fl = El | 0;
        ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
        Dh = Ch | 0;
        Dl = Cl | 0;
        Ch = Bh | 0;
        Cl = Bl | 0;
        Bh = Ah | 0;
        Bl = Al | 0;
        const All = add3L(T1l, sigma0l, MAJl);
        Ah = add3H(All, T1h, sigma0h, MAJh);
        Al = All | 0;
      }
      ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
      ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
      ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
      ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
      ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
      ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
      ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
      ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
      this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
    }
    roundClean() {
      clean(SHA512_W_H, SHA512_W_L);
    }
    destroy() {
      this.destroyed = true;
      clean(this.buffer);
      this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }
  };
  var _SHA512 = class extends SHA2_64B {
    Ah = SHA512_IV[0] | 0;
    Al = SHA512_IV[1] | 0;
    Bh = SHA512_IV[2] | 0;
    Bl = SHA512_IV[3] | 0;
    Ch = SHA512_IV[4] | 0;
    Cl = SHA512_IV[5] | 0;
    Dh = SHA512_IV[6] | 0;
    Dl = SHA512_IV[7] | 0;
    Eh = SHA512_IV[8] | 0;
    El = SHA512_IV[9] | 0;
    Fh = SHA512_IV[10] | 0;
    Fl = SHA512_IV[11] | 0;
    Gh = SHA512_IV[12] | 0;
    Gl = SHA512_IV[13] | 0;
    Hh = SHA512_IV[14] | 0;
    Hl = SHA512_IV[15] | 0;
    constructor() {
      super(64);
    }
  };
  var sha256 = /* @__PURE__ */ createHasher(
    () => new _SHA256(),
    /* @__PURE__ */ oidNist(1)
  );
  var sha512 = /* @__PURE__ */ createHasher(
    () => new _SHA512(),
    /* @__PURE__ */ oidNist(3)
  );

  // node_modules/@noble/hashes/sha3.js
  var _0n = BigInt(0);
  var _1n = BigInt(1);
  var _2n = BigInt(2);
  var _7n = BigInt(7);
  var _256n = BigInt(256);
  var _0x71n = BigInt(113);
  var SHA3_PI = [];
  var SHA3_ROTL = [];
  var _SHA3_IOTA = [];
  for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
    [x, y] = [y, (2 * x + 3 * y) % 5];
    SHA3_PI.push(2 * (5 * y + x));
    SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
    let t = _0n;
    for (let j = 0; j < 7; j++) {
      R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
      if (R & _2n)
        t ^= _1n << (_1n << BigInt(j)) - _1n;
    }
    _SHA3_IOTA.push(t);
  }
  var IOTAS = split(_SHA3_IOTA, true);
  var SHA3_IOTA_H = IOTAS[0];
  var SHA3_IOTA_L = IOTAS[1];
  var rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
  var rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
  function keccakP(s, rounds = 24) {
    anumber(rounds, "rounds");
    if (rounds < 1 || rounds > 24)
      throw new Error('"rounds" expected integer 1..24');
    const B = new Uint32Array(5 * 2);
    for (let round = 24 - rounds; round < 24; round++) {
      for (let x = 0; x < 10; x++)
        B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
      for (let x = 0; x < 10; x += 2) {
        const idx1 = (x + 8) % 10;
        const idx0 = (x + 2) % 10;
        const B0 = B[idx0];
        const B1 = B[idx0 + 1];
        const Th = rotlH(B0, B1, 1) ^ B[idx1];
        const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
        for (let y = 0; y < 50; y += 10) {
          s[x + y] ^= Th;
          s[x + y + 1] ^= Tl;
        }
      }
      let curH = s[2];
      let curL = s[3];
      for (let t = 0; t < 24; t++) {
        const shift = SHA3_ROTL[t];
        const Th = rotlH(curH, curL, shift);
        const Tl = rotlL(curH, curL, shift);
        const PI = SHA3_PI[t];
        curH = s[PI];
        curL = s[PI + 1];
        s[PI] = Th;
        s[PI + 1] = Tl;
      }
      for (let y = 0; y < 50; y += 10) {
        const b0 = s[y], b1 = s[y + 1], b2 = s[y + 2], b3 = s[y + 3];
        s[y] ^= ~s[y + 2] & s[y + 4];
        s[y + 1] ^= ~s[y + 3] & s[y + 5];
        s[y + 2] ^= ~s[y + 4] & s[y + 6];
        s[y + 3] ^= ~s[y + 5] & s[y + 7];
        s[y + 4] ^= ~s[y + 6] & s[y + 8];
        s[y + 5] ^= ~s[y + 7] & s[y + 9];
        s[y + 6] ^= ~s[y + 8] & b0;
        s[y + 7] ^= ~s[y + 9] & b1;
        s[y + 8] ^= ~b0 & b2;
        s[y + 9] ^= ~b1 & b3;
      }
      s[0] ^= SHA3_IOTA_H[round];
      s[1] ^= SHA3_IOTA_L[round];
    }
    clean(B);
  }
  var Keccak = class _Keccak {
    state;
    pos = 0;
    posOut = 0;
    finished = false;
    state32;
    destroyed = false;
    blockLen;
    suffix;
    outputLen;
    canXOF;
    enableXOF = false;
    rounds;
    // NOTE: we accept arguments in bytes instead of bits here.
    constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
      this.blockLen = blockLen;
      this.suffix = suffix;
      this.outputLen = outputLen;
      this.enableXOF = enableXOF;
      this.canXOF = enableXOF;
      this.rounds = rounds;
      anumber(outputLen, "outputLen");
      if (!(0 < blockLen && blockLen < 200))
        throw new Error("only keccak-f1600 function is supported");
      this.state = new Uint8Array(200);
      this.state32 = u32(this.state);
    }
    clone() {
      return this._cloneInto();
    }
    keccak() {
      swap32IfBE(this.state32);
      keccakP(this.state32, this.rounds);
      swap32IfBE(this.state32);
      this.posOut = 0;
      this.pos = 0;
    }
    update(data) {
      aexists(this);
      abytes(data);
      const { blockLen, state } = this;
      const len = data.length;
      for (let pos = 0; pos < len; ) {
        const take = Math.min(blockLen - this.pos, len - pos);
        for (let i = 0; i < take; i++)
          state[this.pos++] ^= data[pos++];
        if (this.pos === blockLen)
          this.keccak();
      }
      return this;
    }
    finish() {
      if (this.finished)
        return;
      this.finished = true;
      const { state, suffix, pos, blockLen } = this;
      state[pos] ^= suffix;
      if ((suffix & 128) !== 0 && pos === blockLen - 1)
        this.keccak();
      state[blockLen - 1] ^= 128;
      this.keccak();
    }
    writeInto(out) {
      aexists(this, false);
      abytes(out);
      this.finish();
      const bufferOut = this.state;
      const { blockLen } = this;
      for (let pos = 0, len = out.length; pos < len; ) {
        if (this.posOut >= blockLen)
          this.keccak();
        const take = Math.min(blockLen - this.posOut, len - pos);
        out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
        this.posOut += take;
        pos += take;
      }
      return out;
    }
    xofInto(out) {
      if (!this.enableXOF)
        throw new Error("XOF is not possible for this instance");
      return this.writeInto(out);
    }
    xof(bytes) {
      anumber(bytes);
      return this.xofInto(new Uint8Array(bytes));
    }
    digestInto(out) {
      aoutput(out, this);
      if (this.finished)
        throw new Error("digest() was already called");
      this.writeInto(out.subarray(0, this.outputLen));
      this.destroy();
    }
    digest() {
      const out = new Uint8Array(this.outputLen);
      this.digestInto(out);
      return out;
    }
    destroy() {
      this.destroyed = true;
      clean(this.state);
    }
    _cloneInto(to) {
      const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
      to ||= new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds);
      to.blockLen = blockLen;
      to.state32.set(this.state32);
      to.pos = this.pos;
      to.posOut = this.posOut;
      to.finished = this.finished;
      to.rounds = rounds;
      to.suffix = suffix;
      to.outputLen = outputLen;
      to.enableXOF = enableXOF;
      to.canXOF = this.canXOF;
      to.destroyed = this.destroyed;
      return to;
    }
  };
  var genShake = (suffix, blockLen, outputLen, info = {}) => createHasher((opts = {}) => new Keccak(blockLen, suffix, opts.dkLen === void 0 ? outputLen : opts.dkLen, true), info);
  var shake256 = /* @__PURE__ */ genShake(31, 136, 32, /* @__PURE__ */ oidNist(12));

  // node_modules/@noble/post-quantum/utils.js
  var abytesDoc = abytes;
  var randomBytes2 = randomBytes;
  function equalBytes(a, b) {
    if (a.length !== b.length)
      return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
      diff |= a[i] ^ b[i];
    return diff === 0;
  }
  function copyBytes(bytes) {
    return Uint8Array.from(abytes(bytes));
  }
  function validateOpts(opts) {
    if (Object.prototype.toString.call(opts) !== "[object Object]")
      throw new TypeError("expected valid options object");
  }
  function validateVerOpts(opts) {
    validateOpts(opts);
    if (opts.context !== void 0)
      abytes(opts.context, void 0, "opts.context");
  }
  function validateSigOpts(opts) {
    validateVerOpts(opts);
    if (opts.extraEntropy !== false && opts.extraEntropy !== void 0)
      abytes(opts.extraEntropy, void 0, "opts.extraEntropy");
  }
  function splitCoder(label, ...lengths) {
    const getLength = (c) => typeof c === "number" ? c : c.bytesLen;
    const bytesLen = lengths.reduce((sum, a) => sum + getLength(a), 0);
    return {
      bytesLen,
      encode: (bufs) => {
        const res = new Uint8Array(bytesLen);
        for (let i = 0, pos = 0; i < lengths.length; i++) {
          const c = lengths[i];
          const l = getLength(c);
          const b = typeof c === "number" ? bufs[i] : c.encode(bufs[i]);
          abytes(b, l, label);
          res.set(b, pos);
          if (typeof c !== "number")
            b.fill(0);
          pos += l;
        }
        return res;
      },
      decode: (buf) => {
        abytes(buf, bytesLen, label);
        const res = [];
        for (const c of lengths) {
          const l = getLength(c);
          const b = buf.subarray(0, l);
          res.push(typeof c === "number" ? b : c.decode(b));
          buf = buf.subarray(l);
        }
        return res;
      }
    };
  }
  function vecCoder(c, vecLen) {
    const coder = c;
    const bytesLen = vecLen * coder.bytesLen;
    return {
      bytesLen,
      encode: (u) => {
        if (u.length !== vecLen)
          throw new RangeError(`vecCoder.encode: wrong length=${u.length}. Expected: ${vecLen}`);
        const res = new Uint8Array(bytesLen);
        for (let i = 0, pos = 0; i < u.length; i++) {
          const b = coder.encode(u[i]);
          res.set(b, pos);
          b.fill(0);
          pos += b.length;
        }
        return res;
      },
      decode: (a) => {
        abytes(a, bytesLen);
        const r = [];
        for (let i = 0; i < a.length; i += coder.bytesLen)
          r.push(coder.decode(a.subarray(i, i + coder.bytesLen)));
        return r;
      }
    };
  }
  function cleanBytes(...list) {
    for (const t of list) {
      if (Array.isArray(t))
        for (const b of t)
          b.fill(0);
      else
        t.fill(0);
    }
  }
  function getMask(bits) {
    if (!Number.isSafeInteger(bits) || bits < 0 || bits > 32)
      throw new RangeError(`expected bits in [0..32], got ${bits}`);
    return bits === 32 ? 4294967295 : ~(-1 << bits) >>> 0;
  }
  var EMPTY = /* @__PURE__ */ Uint8Array.of();
  function getMessage(msg, ctx = EMPTY) {
    abytes(msg);
    abytes(ctx);
    if (ctx.length > 255)
      throw new RangeError("context should be 255 bytes or less");
    return concatBytes(new Uint8Array([0, ctx.length]), ctx, msg);
  }
  var oidNistP = /* @__PURE__ */ Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2]);
  function checkHash(hash, requiredStrength = 0) {
    if (!hash.oid || !equalBytes(hash.oid.subarray(0, 10), oidNistP))
      throw new Error("hash.oid is invalid: expected NIST hash");
    const collisionResistance = hash.outputLen * 8 / 2;
    if (requiredStrength > collisionResistance) {
      throw new Error("Pre-hash security strength too low: " + collisionResistance + ", required: " + requiredStrength);
    }
  }
  function getMessagePrehash(hash, msg, ctx = EMPTY) {
    abytes(msg);
    abytes(ctx);
    if (ctx.length > 255)
      throw new RangeError("context should be 255 bytes or less");
    const hashed = hash(msg);
    return concatBytes(new Uint8Array([1, ctx.length]), ctx, hash.oid, hashed);
  }

  // node_modules/@noble/post-quantum/slh-dsa.js
  var PARAMS = /* @__PURE__ */ (() => Object.freeze({
    "128f": Object.freeze({ W: 16, N: 16, H: 66, D: 22, K: 33, A: 6, securityLevel: 128 }),
    "128s": Object.freeze({ W: 16, N: 16, H: 63, D: 7, K: 14, A: 12, securityLevel: 128 }),
    "192f": Object.freeze({ W: 16, N: 24, H: 66, D: 22, K: 33, A: 8, securityLevel: 192 }),
    "192s": Object.freeze({ W: 16, N: 24, H: 63, D: 7, K: 17, A: 14, securityLevel: 192 }),
    "256f": Object.freeze({ W: 16, N: 32, H: 68, D: 17, K: 35, A: 9, securityLevel: 256 }),
    "256s": Object.freeze({ W: 16, N: 32, H: 64, D: 8, K: 22, A: 14, securityLevel: 256 })
  }))();
  var AddressType = {
    WOTS: 0,
    WOTSPK: 1,
    HASHTREE: 2,
    FORSTREE: 3,
    FORSPK: 4,
    WOTSPRF: 5,
    FORSPRF: 6
  };
  function hexToNumber(hex) {
    if (typeof hex !== "string")
      throw new Error("hex string expected, got " + typeof hex);
    return BigInt(hex === "" ? "0" : "0x" + hex);
  }
  function bytesToNumberBE(bytes) {
    return hexToNumber(bytesToHex(bytes));
  }
  function numberToBytesBE(n, len) {
    return hexToBytes(n.toString(16).padStart(len * 2, "0"));
  }
  var base2b = (outLen, b) => {
    const mask = getMask(b);
    return (bytes) => {
      const baseB = new Uint32Array(outLen);
      for (let out = 0, pos = 0, bits = 0, total = 0; out < outLen; out++) {
        while (bits < b) {
          total = total << 8 | bytes[pos++];
          bits += 8;
        }
        bits -= b;
        baseB[out] = total >>> bits & mask;
      }
      return baseB;
    };
  };
  function getMaskBig(bits) {
    return (1n << BigInt(bits)) - 1n;
  }
  function gen(opts, hashOpts_) {
    const hashOpts = hashOpts_;
    const { N, W, H, D, K, A, securityLevel } = opts;
    const getContext = hashOpts.getContext(opts);
    if (W !== 16)
      throw new Error("Unsupported Winternitz parameter");
    const WOTS_LOGW = 4;
    const WOTS_LEN1 = Math.floor(8 * N / WOTS_LOGW);
    const WOTS_LEN2 = N <= 8 ? 2 : N <= 136 ? 3 : 4;
    const TREE_HEIGHT = Math.floor(H / D);
    const WOTS_LEN = WOTS_LEN1 + WOTS_LEN2;
    let ADDR_BYTES = 22;
    let OFFSET_LAYER = 0;
    let OFFSET_TREE = 1;
    let OFFSET_TYPE = 9;
    let OFFSET_KP_ADDR2 = 12;
    let OFFSET_KP_ADDR1 = 13;
    let OFFSET_CHAIN_ADDR = 17;
    let OFFSET_TREE_INDEX = 18;
    let OFFSET_HASH_ADDR = 21;
    if (!hashOpts.isCompressed) {
      ADDR_BYTES = 32;
      OFFSET_LAYER += 3;
      OFFSET_TREE += 7;
      OFFSET_TYPE += 10;
      OFFSET_KP_ADDR2 += 10;
      OFFSET_KP_ADDR1 += 10;
      OFFSET_CHAIN_ADDR += 10;
      OFFSET_TREE_INDEX += 10;
      OFFSET_HASH_ADDR += 10;
    }
    const setAddr = (opts2, addr = new Uint8Array(ADDR_BYTES)) => {
      const { type, height, tree, layer, index, chain, hash, keypair } = opts2;
      const { subtreeAddr, keypairAddr } = opts2;
      const v = createView(addr);
      if (height !== void 0)
        addr[OFFSET_CHAIN_ADDR] = height;
      if (layer !== void 0)
        addr[OFFSET_LAYER] = layer;
      if (type !== void 0)
        addr[OFFSET_TYPE] = type;
      if (chain !== void 0)
        addr[OFFSET_CHAIN_ADDR] = chain;
      if (hash !== void 0)
        addr[OFFSET_HASH_ADDR] = hash;
      if (index !== void 0)
        v.setUint32(OFFSET_TREE_INDEX, index, false);
      if (subtreeAddr)
        addr.set(subtreeAddr.subarray(0, OFFSET_TREE + 8));
      if (tree !== void 0)
        v.setBigUint64(OFFSET_TREE, tree, false);
      if (keypair !== void 0) {
        addr[OFFSET_KP_ADDR1] = keypair;
        if (TREE_HEIGHT > 8)
          addr[OFFSET_KP_ADDR2] = keypair >>> 8;
      }
      if (keypairAddr) {
        addr.set(keypairAddr.subarray(0, OFFSET_TREE + 8));
        addr[OFFSET_KP_ADDR1] = keypairAddr[OFFSET_KP_ADDR1];
        if (TREE_HEIGHT > 8)
          addr[OFFSET_KP_ADDR2] = keypairAddr[OFFSET_KP_ADDR2];
      }
      return addr;
    };
    const chainCoder = base2b(WOTS_LEN2, WOTS_LOGW);
    const chainLengths = (msg) => {
      const W1 = base2b(WOTS_LEN1, WOTS_LOGW)(msg);
      let csum = 0;
      for (let i = 0; i < W1.length; i++)
        csum += W - 1 - W1[i];
      csum <<= (8 - WOTS_LEN2 * WOTS_LOGW % 8) % 8;
      const W2 = chainCoder(numberToBytesBE(csum, Math.ceil(WOTS_LEN2 * WOTS_LOGW / 8)));
      const lengths = new Uint32Array(WOTS_LEN);
      lengths.set(W1);
      lengths.set(W2, W1.length);
      return lengths;
    };
    const messageToIndices = base2b(K, A);
    const TREE_BITS = TREE_HEIGHT * (D - 1);
    const LEAF_BITS = TREE_HEIGHT;
    const hashMsgCoder = splitCoder("hashedMessage", Math.ceil(A * K / 8), Math.ceil(TREE_BITS / 8), Math.ceil(TREE_HEIGHT / 8));
    const hashMessage = (R, pkSeed, msg, context) => {
      const rawContext = context;
      const digest = rawContext.Hmsg(R, pkSeed, msg, hashMsgCoder.bytesLen);
      const [md, tmpIdxTree, tmpIdxLeaf] = hashMsgCoder.decode(digest);
      const tree = bytesToNumberBE(tmpIdxTree) & getMaskBig(TREE_BITS);
      const leafIdx = Number(bytesToNumberBE(tmpIdxLeaf)) & getMask(LEAF_BITS);
      return { tree, leafIdx, md };
    };
    const treehash = (height, fn) => function treehash_i(context, leafIdx, idxOffset, treeAddr, info) {
      const rawContext = context;
      const leafFn = fn;
      const maxIdx = (1 << height) - 1;
      const stack = new Uint8Array(height * N);
      const authPath = new Uint8Array(height * N);
      for (let idx = 0; ; idx++) {
        const current = new Uint8Array(2 * N);
        const cur0 = current.subarray(0, N);
        const cur1 = current.subarray(N);
        const addrOffset = idx + idxOffset;
        cur1.set(leafFn(leafIdx, addrOffset, rawContext, info));
        let h = 0;
        for (let i = idx, o = idxOffset, l = leafIdx; ; h++, i >>>= 1, l >>>= 1, o >>>= 1) {
          if (h === height)
            return { root: cur1, authPath };
          if ((i ^ l) === 1)
            authPath.subarray(h * N).set(cur1);
          if ((i & 1) === 0 && idx < maxIdx)
            break;
          setAddr({ height: h + 1, index: (i >> 1) + (o >> 1) }, treeAddr);
          cur0.set(stack.subarray(h * N).subarray(0, N));
          cur1.set(rawContext.thashN(2, current, treeAddr));
        }
        stack.subarray(h * N).set(cur1);
      }
      throw new Error("Unreachable code path reached, report this error");
    };
    const wotsTreehash = treehash(TREE_HEIGHT, (leafIdx, addrOffset, context, info) => {
      const rawContext = context;
      const wotsPk = new Uint8Array(WOTS_LEN * N);
      const wotsKmask = addrOffset === leafIdx ? 0 : ~0 >>> 0;
      setAddr({ keypair: addrOffset }, info.leafAddr);
      setAddr({ keypair: addrOffset }, info.pkAddr);
      for (let i = 0; i < WOTS_LEN; i++) {
        const wotsK = info.wotsSteps[i] | wotsKmask;
        const pk = wotsPk.subarray(i * N, (i + 1) * N);
        setAddr({ chain: i, hash: 0, type: AddressType.WOTSPRF }, info.leafAddr);
        pk.set(rawContext.PRFaddr(info.leafAddr));
        setAddr({ type: AddressType.WOTS }, info.leafAddr);
        for (let k = 0; ; k++) {
          if (k === wotsK)
            info.wotsSig.subarray(i * N).set(pk);
          if (k === W - 1)
            break;
          setAddr({ hash: k }, info.leafAddr);
          pk.set(rawContext.thash1(pk, info.leafAddr));
        }
      }
      return rawContext.thashN(WOTS_LEN, wotsPk, info.pkAddr);
    });
    const forsTreehash = treehash(A, (_, addrOffset, context, forsLeafAddr) => {
      const rawContext = context;
      setAddr({ type: AddressType.FORSPRF, index: addrOffset }, forsLeafAddr);
      const prf = rawContext.PRFaddr(forsLeafAddr);
      setAddr({ type: AddressType.FORSTREE }, forsLeafAddr);
      return rawContext.thash1(prf, forsLeafAddr);
    });
    const merkleSign = (context, wotsAddr, treeAddr, leafIdx, prevRoot = new Uint8Array(N)) => {
      setAddr({ type: AddressType.HASHTREE }, treeAddr);
      const info = {
        wotsSig: new Uint8Array(wotsCoder.bytesLen),
        wotsSteps: chainLengths(prevRoot),
        leafAddr: setAddr({ subtreeAddr: wotsAddr }),
        pkAddr: setAddr({ type: AddressType.WOTSPK, subtreeAddr: wotsAddr })
      };
      const { root, authPath } = wotsTreehash(context, leafIdx, 0, treeAddr, info);
      return {
        root,
        sigWots: info.wotsSig.subarray(0, WOTS_LEN * N),
        sigAuth: authPath
      };
    };
    const computeRoot = (leaf, leafIdx, idxOffset, authPath, treeHeight, context, addr) => {
      const rawContext = context;
      const buffer = new Uint8Array(2 * N);
      const b0 = buffer.subarray(0, N);
      const b1 = buffer.subarray(N, 2 * N);
      if ((leafIdx & 1) !== 0) {
        b1.set(leaf.subarray(0, N));
        b0.set(authPath.subarray(0, N));
      } else {
        b0.set(leaf.subarray(0, N));
        b1.set(authPath.subarray(0, N));
      }
      leafIdx >>>= 1;
      idxOffset >>>= 1;
      for (let i = 0; i < treeHeight - 1; i++, leafIdx >>= 1, idxOffset >>= 1) {
        setAddr({ height: i + 1, index: leafIdx + idxOffset }, addr);
        const a = authPath.subarray((i + 1) * N, (i + 2) * N);
        if ((leafIdx & 1) !== 0) {
          b1.set(rawContext.thashN(2, buffer, addr));
          b0.set(a);
        } else {
          buffer.set(rawContext.thashN(2, buffer, addr));
          b1.set(a);
        }
      }
      setAddr({ height: treeHeight, index: leafIdx + idxOffset }, addr);
      return rawContext.thashN(2, buffer, addr);
    };
    const seedCoder = splitCoder("seed", N, N, N);
    const publicCoder = splitCoder("publicKey", N, N);
    const secretCoder = splitCoder("secretKey", N, N, publicCoder.bytesLen);
    const forsCoder = vecCoder(splitCoder("fors", N, N * A), K);
    const wotsCoder = vecCoder(splitCoder("wots", WOTS_LEN * N, TREE_HEIGHT * N), D);
    const sigCoder = splitCoder("signature", N, forsCoder, wotsCoder);
    const internal = Object.freeze({
      info: Object.freeze({ type: "internal-slh-dsa" }),
      lengths: Object.freeze({
        publicKey: publicCoder.bytesLen,
        secretKey: secretCoder.bytesLen,
        signature: sigCoder.bytesLen,
        seed: seedCoder.bytesLen,
        signRand: N
      }),
      keygen(seed) {
        if (seed !== void 0)
          abytesDoc(seed, seedCoder.bytesLen, "seed");
        seed = seed === void 0 ? randomBytes2(seedCoder.bytesLen) : copyBytes(seed);
        const [secretSeed, secretPRF, publicSeed] = seedCoder.decode(seed);
        const context = getContext(publicSeed, secretSeed);
        const topTreeAddr = setAddr({ layer: D - 1 });
        const wotsAddr = setAddr({ layer: D - 1 });
        const { root } = merkleSign(context, wotsAddr, topTreeAddr, ~0 >>> 0);
        const publicKey = publicCoder.encode([publicSeed, root]);
        const secretKey = secretCoder.encode([secretSeed, secretPRF, publicKey]);
        context.clean();
        cleanBytes(secretSeed, secretPRF, root, wotsAddr, topTreeAddr);
        return {
          publicKey,
          secretKey
        };
      },
      getPublicKey: (secretKey) => {
        const [_skSeed, _skPRF, pk] = secretCoder.decode(secretKey);
        return Uint8Array.from(pk);
      },
      sign: (msg, sk, opts2 = {}) => {
        validateSigOpts(opts2);
        let { extraEntropy: random } = opts2;
        const [skSeed, skPRF, pk] = secretCoder.decode(sk);
        const [pkSeed, _] = publicCoder.decode(pk);
        if (random === false)
          random = copyBytes(pkSeed);
        else if (random === void 0)
          random = randomBytes2(N);
        else
          random = copyBytes(random);
        abytesDoc(random, N);
        const context = getContext(pkSeed, skSeed);
        const R = context.PRFmsg(skPRF, random, msg);
        let { tree, leafIdx, md } = hashMessage(R, pk, msg, context);
        const wotsAddr = setAddr({
          type: AddressType.WOTS,
          tree,
          keypair: leafIdx
        });
        const roots = [];
        const forsLeaf = setAddr({ keypairAddr: wotsAddr });
        const forsTreeAddr = setAddr({ keypairAddr: wotsAddr });
        const indices = messageToIndices(md);
        const fors = [];
        for (let i = 0; i < indices.length; i++) {
          const idxOffset = i << A;
          setAddr({
            type: AddressType.FORSPRF,
            height: 0,
            index: indices[i] + idxOffset
          }, forsTreeAddr);
          const prf = context.PRFaddr(forsTreeAddr);
          setAddr({ type: AddressType.FORSTREE }, forsTreeAddr);
          const { root: root2, authPath } = forsTreehash(context, indices[i], idxOffset, forsTreeAddr, forsLeaf);
          roots.push(root2);
          fors.push([prf, authPath]);
        }
        const forsPkAddr = setAddr({
          type: AddressType.FORSPK,
          keypairAddr: wotsAddr
        });
        const root = context.thashN(K, concatBytes(...roots), forsPkAddr);
        const treeAddr = setAddr({ type: AddressType.HASHTREE });
        const wots = [];
        for (let i = 0; i < D; i++, tree >>= BigInt(TREE_HEIGHT)) {
          setAddr({ tree, layer: i }, treeAddr);
          setAddr({ subtreeAddr: treeAddr, keypair: leafIdx }, wotsAddr);
          const { sigWots, sigAuth, root: r } = merkleSign(context, wotsAddr, treeAddr, leafIdx, root);
          root.set(r);
          cleanBytes(r);
          wots.push([sigWots, sigAuth]);
          leafIdx = Number(tree & getMaskBig(TREE_HEIGHT));
        }
        context.clean();
        const SIG = sigCoder.encode([R, fors, wots]);
        cleanBytes(R, random, treeAddr, wotsAddr, forsLeaf, forsTreeAddr, indices, roots);
        return SIG;
      },
      verify: (sig, msg, publicKey) => {
        const [pkSeed, pubRoot] = publicCoder.decode(publicKey);
        const [random, forsVec, wotsVec] = sigCoder.decode(sig);
        const pk = publicKey;
        if (sig.length !== sigCoder.bytesLen)
          return false;
        const context = getContext(pkSeed);
        let { tree, leafIdx, md } = hashMessage(random, pk, msg, context);
        const wotsAddr = setAddr({
          type: AddressType.WOTS,
          tree,
          keypair: leafIdx
        });
        const roots = [];
        const forsTreeAddr = setAddr({
          type: AddressType.FORSTREE,
          keypairAddr: wotsAddr
        });
        const indices = messageToIndices(md);
        for (let i = 0; i < forsVec.length; i++) {
          const [prf, authPath] = forsVec[i];
          const idxOffset = i << A;
          setAddr({ height: 0, index: indices[i] + idxOffset }, forsTreeAddr);
          const leaf = context.thash1(prf, forsTreeAddr);
          roots.push(computeRoot(leaf, indices[i], idxOffset, authPath, A, context, forsTreeAddr));
        }
        const forsPkAddr = setAddr({
          type: AddressType.FORSPK,
          keypairAddr: wotsAddr
        });
        let root = context.thashN(K, concatBytes(...roots), forsPkAddr);
        const treeAddr = setAddr({ type: AddressType.HASHTREE });
        const wotsPkAddr = setAddr({ type: AddressType.WOTSPK });
        const wotsPk = new Uint8Array(WOTS_LEN * N);
        for (let i = 0; i < wotsVec.length; i++, tree >>= BigInt(TREE_HEIGHT)) {
          const [wots, sigAuth] = wotsVec[i];
          setAddr({ tree, layer: i }, treeAddr);
          setAddr({ subtreeAddr: treeAddr, keypair: leafIdx }, wotsAddr);
          setAddr({ keypairAddr: wotsAddr }, wotsPkAddr);
          const lengths = chainLengths(root);
          for (let i2 = 0; i2 < WOTS_LEN; i2++) {
            setAddr({ chain: i2 }, wotsAddr);
            const steps = W - 1 - lengths[i2];
            const start = lengths[i2];
            const out = wotsPk.subarray(i2 * N);
            out.set(wots.subarray(i2 * N, (i2 + 1) * N));
            for (let j = start; j < start + steps && j < W; j++) {
              setAddr({ hash: j }, wotsAddr);
              out.set(context.thash1(out, wotsAddr));
            }
          }
          const leaf = context.thashN(WOTS_LEN, wotsPk, wotsPkAddr);
          root = computeRoot(leaf, leafIdx, 0, sigAuth, TREE_HEIGHT, context, treeAddr);
          leafIdx = Number(tree & getMaskBig(TREE_HEIGHT));
        }
        return equalBytes(root, pubRoot);
      }
    });
    return Object.freeze({
      info: Object.freeze({ type: "slh-dsa" }),
      internal,
      securityLevel,
      lengths: internal.lengths,
      keygen: internal.keygen,
      getPublicKey: internal.getPublicKey,
      sign: (msg, secretKey, opts2 = {}) => {
        validateSigOpts(opts2);
        const M = getMessage(msg, opts2.context);
        const res = internal.sign(M, secretKey, opts2);
        cleanBytes(M);
        return res;
      },
      verify: (sig, msg, publicKey, opts2 = {}) => {
        validateVerOpts(opts2);
        return internal.verify(sig, getMessage(msg, opts2.context), publicKey);
      },
      prehash: (hash) => {
        checkHash(hash, securityLevel);
        const rawHash = hash;
        return Object.freeze({
          info: Object.freeze({ type: "hashslh-dsa" }),
          lengths: internal.lengths,
          keygen: internal.keygen,
          getPublicKey: internal.getPublicKey,
          sign: (msg, secretKey, opts2 = {}) => {
            validateSigOpts(opts2);
            const M = getMessagePrehash(rawHash, msg, opts2.context);
            const res = internal.sign(M, secretKey, opts2);
            cleanBytes(M);
            return res;
          },
          verify: (sig, msg, publicKey, opts2 = {}) => {
            validateVerOpts(opts2);
            return internal.verify(sig, getMessagePrehash(rawHash, msg, opts2.context), publicKey);
          }
        });
      }
    });
  }
  var genShake2 = () => (opts) => (pubSeed, skSeed) => {
    const { N } = opts;
    const stats = { prf: 0, thash: 0, hmsg: 0, gen_message_random: 0 };
    const h0 = shake256.create({}).update(pubSeed);
    const h0tmp = h0.clone();
    const thash = (blocks, input, addr) => {
      stats.thash++;
      return h0._cloneInto(h0tmp).update(addr).update(input.subarray(0, blocks * N)).xof(N);
    };
    return {
      PRFaddr: (addr) => {
        if (!skSeed)
          throw new Error("no sk seed");
        stats.prf++;
        const res = h0._cloneInto(h0tmp).update(addr).update(skSeed).xof(N);
        return res;
      },
      PRFmsg: (skPRF, random, msg) => {
        stats.gen_message_random++;
        return shake256.create({}).update(skPRF).update(random).update(msg).digest().subarray(0, N);
      },
      Hmsg: (R, pk, m, outLen) => {
        stats.hmsg++;
        return shake256.create({}).update(R.subarray(0, N)).update(pk).update(m).xof(outLen);
      },
      thash1: thash.bind(null, 1),
      thashN: thash,
      clean: () => {
        h0.destroy();
        h0tmp.destroy();
      }
    };
  };
  var SHAKE_SIMPLE = /* @__PURE__ */ (() => ({ getContext: genShake2() }))();
  var slh_dsa_shake_128f = /* @__PURE__ */ (() => gen(PARAMS["128f"], SHAKE_SIMPLE))();
  var slh_dsa_shake_128s = /* @__PURE__ */ (() => gen(PARAMS["128s"], SHAKE_SIMPLE))();
  var slh_dsa_shake_192f = /* @__PURE__ */ (() => gen(PARAMS["192f"], SHAKE_SIMPLE))();
  var slh_dsa_shake_192s = /* @__PURE__ */ (() => gen(PARAMS["192s"], SHAKE_SIMPLE))();
  var slh_dsa_shake_256f = /* @__PURE__ */ (() => gen(PARAMS["256f"], SHAKE_SIMPLE))();
  var slh_dsa_shake_256s = /* @__PURE__ */ (() => gen(PARAMS["256s"], SHAKE_SIMPLE))();
  var genSha = (h0, h1) => (opts) => (pub_seed, sk_seed) => {
    const { N } = opts;
    const stats = { prf: 0, thash: 0, hmsg: 0, gen_message_random: 0, mgf1: 0 };
    const counterB = new Uint8Array(4);
    const counterV = createView(counterB);
    const h0ps = h0.create().update(pub_seed).update(new Uint8Array(h0.blockLen - N));
    const h1ps = h1.create().update(pub_seed).update(new Uint8Array(h1.blockLen - N));
    const h0tmp = h0ps.clone();
    const h1tmp = h1ps.clone();
    function mgf1(seed, length, hash) {
      stats.mgf1++;
      const out = new Uint8Array(Math.ceil(length / hash.outputLen) * hash.outputLen);
      if (length > 2 ** 32)
        throw new Error("mask too long");
      for (let counter = 0, o = out; o.length; counter++) {
        counterV.setUint32(0, counter, false);
        hash.create().update(seed).update(counterB).digestInto(o);
        o = o.subarray(hash.outputLen);
      }
      cleanBytes(out.subarray(length));
      return out.subarray(0, length);
    }
    const thash = (_, h, hTmp) => (blocks, input, addr) => {
      stats.thash++;
      const d = h._cloneInto(hTmp).update(addr).update(input.subarray(0, blocks * N)).digest();
      return d.subarray(0, N);
    };
    return {
      PRFaddr: (addr) => {
        if (!sk_seed)
          throw new Error("No sk seed");
        stats.prf++;
        const res = h0ps._cloneInto(h0tmp).update(addr).update(sk_seed).digest().subarray(0, N);
        return res;
      },
      PRFmsg: (skPRF, random, msg) => {
        stats.gen_message_random++;
        return hmac.create(h1, skPRF).update(random).update(msg).digest().subarray(0, N);
      },
      Hmsg: (R, pk, m, outLen) => {
        stats.hmsg++;
        const seed = concatBytes(R.subarray(0, N), pk.subarray(0, N), h1.create().update(R.subarray(0, N)).update(pk).update(m).digest());
        return mgf1(seed, outLen, h1);
      },
      thash1: thash(h0, h0ps, h0tmp).bind(null, 1),
      thashN: thash(h1, h1ps, h1tmp),
      clean: () => {
        h0ps.destroy();
        h1ps.destroy();
        h0tmp.destroy();
        h1tmp.destroy();
      }
    };
  };
  var SHA256_SIMPLE = /* @__PURE__ */ (() => ({
    isCompressed: true,
    getContext: genSha(sha256, sha256)
  }))();
  var SHA512_SIMPLE = /* @__PURE__ */ (() => ({
    isCompressed: true,
    getContext: genSha(sha256, sha512)
  }))();
  var slh_dsa_sha2_128f = /* @__PURE__ */ (() => gen(PARAMS["128f"], SHA256_SIMPLE))();
  var slh_dsa_sha2_128s = /* @__PURE__ */ (() => gen(PARAMS["128s"], SHA256_SIMPLE))();
  var slh_dsa_sha2_192f = /* @__PURE__ */ (() => gen(PARAMS["192f"], SHA512_SIMPLE))();
  var slh_dsa_sha2_192s = /* @__PURE__ */ (() => gen(PARAMS["192s"], SHA512_SIMPLE))();
  var slh_dsa_sha2_256f = /* @__PURE__ */ (() => gen(PARAMS["256f"], SHA512_SIMPLE))();
  var slh_dsa_sha2_256s = /* @__PURE__ */ (() => gen(PARAMS["256s"], SHA512_SIMPLE))();
  return __toCommonJS(slh_dsa_exports);
})();
/*! Bundled license information:

@noble/post-quantum/utils.js:
@noble/post-quantum/slh-dsa.js:
  (*! noble-post-quantum - MIT License (c) 2024 Paul Miller (paulmillr.com) *)
*/
