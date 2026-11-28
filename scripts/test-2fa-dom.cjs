// SPDX-License-Identifier: GPL-3.0-only
/**
 * Minimal DOM harness for the website copy of the 2FA module (www/modules).
 *
 * Why this exists: the v3.3.15 build shipped a setup flow that threw
 * "Cannot set properties of null (setting 'textContent')" on the very first click.
 * Nothing in CI renders these modules, and `tauri dev` only catches what a human
 * happens to click. This harness mounts the real modules, dispatches the real click,
 * and fails when the flow throws or renders nothing.
 *
 * It is deliberately a shim, not jsdom: only the surfaces these modules touch are
 * implemented (ids, classes, innerHTML parsing, listeners, canvas 2d no-ops). When a
 * module starts needing more, the shim should grow a node/attribute at a time rather
 * than the test becoming a browser.
 *
 * Usage: node scripts/test-client-dom.cjs
 * Exit: 0 all checks pass, 1 a check failed.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'www');

let failures = 0;
const checks = [];
function check(name, fn) { checks.push([name, fn]); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─────────────────────────────────────────────────────────────── DOM shim ──
class ClassList {
  constructor(node) { this.node = node; }
  get set() { return new Set((this.node.className || '').split(/\s+/).filter(Boolean)); }
  _write(s) { this.node.className = Array.from(s).join(' '); }
  add(c) { const s = this.set; s.add(c); this._write(s); }
  remove(c) { const s = this.set; s.delete(c); this._write(s); }
  toggle(c, on) { const s = this.set; const want = on === undefined ? !s.has(c) : !!on; if (want) s.add(c); else s.delete(c); this._write(s); return want; }
  contains(c) { return this.set.has(c); }
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this._text = '';
    this._innerHTML = '';
    this.classList = new ClassList(this);
    this.className = '';
    this.id = '';
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(html) {
    this._innerHTML = String(html);
    this.children = [];
    parseInto(this, this._innerHTML);
  }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  remove() {
    if (this.parentNode) {
      const i = this.parentNode.children.indexOf(this);
      if (i >= 0) this.parentNode.children.splice(i, 1);
      this.parentNode = null;
    }
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  click() { (this.listeners.click || []).forEach((fn) => fn({ target: this, preventDefault() {} })); }
  focus() {}
  getContext() {
    const noop = () => {};
    const self = this;
    return { fillStyle: '', imageSmoothingEnabled: true,
      // Counted so a test can prove the QR was painted rather than merely mounted.
      fillRect: () => { self._fillRects = (self._fillRects || 0) + 1; },
      fillText: noop, drawImage: (img) => { self._drawImageCalls = (self._drawImageCalls || 0) + 1; },
      beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, clearRect: noop, scale: noop, save: noop, restore: noop, translate: noop, rotate: noop };
  }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(sel) {
    const m = /^([.#])([\w-]+)$/.exec(String(sel).trim());
    if (!m) throw new Error('shim: unsupported selector ' + sel);
    const [, kind, name] = m;
    const out = [];
    for (const el of this.walk()) {
      if (kind === '#' ? el.id === name : el.classList.contains(name)) out.push(el);
    }
    return out;
  }
  querySelector(sel) {
    // "#id .cls" and "#id" / ".cls". Anything else is a selector the shim
    // does not model, and pretending otherwise would hide a real code path.
    const s = String(sel).trim();
    const pair = /^([.#][\w-]+)\s+([.#][\w-]+)$/.exec(s);
    if (pair) {
      for (const scope of this.querySelectorAll(pair[1])) {
        const hit = scope.querySelectorAll(pair[2]);
        if (hit.length) return hit[0];
      }
      return null;
    }
    return this.querySelectorAll(s)[0] || null;
  }
}

function parseAttributes(text) {
  // Linear scan. The obvious attribute regex nests a quantified group whose
  // branches can each match a quote run, which CodeQL flags as exponential
  // backtracking - and it only takes one hostile fixture to hang the gate.
  const out = [];
  let i = 0;
  const n = text.length;
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  while (i < n) {
    while (i < n && isSpace(text[i])) i++;
    if (i >= n) break;
    const nameStart = i;
    while (i < n && !isSpace(text[i]) && text[i] !== '=' && text[i] !== '>' && text[i] !== '/') i++;
    const name = text.slice(nameStart, i);
    if (!name) { i += 1; continue; }
    while (i < n && isSpace(text[i])) i++;
    let value = '';
    if (text[i] === '=') {
      i += 1;
      while (i < n && isSpace(text[i])) i++;
      const quote = text[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        const valueStart = i;
        while (i < n && text[i] !== quote) i++;
        value = text.slice(valueStart, i);
        if (i < n) i += 1;
      } else {
        const valueStart = i;
        while (i < n && !isSpace(text[i]) && text[i] !== '>') i++;
        value = text.slice(valueStart, i);
      }
    }
    out.push([name, value]);
  }
  return out;
}

function parseInto(root, html) {
  const voidTags = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'path', 'circle', 'line', 'rect', 'polyline', 'polygon', 'use', 'stop']);
  const stack = [root];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      const close = html.indexOf('-->', lt + 4);
      i = close < 0 ? n : close + 3;
      continue;
    }
    let j = lt + 1;
    let closing = false;
    if (html[j] === '/') { closing = true; j += 1; }
    const nameStart = j;
    while (j < n && /[\w-]/.test(html[j])) j++;
    const tag = html.slice(nameStart, j);
    if (!tag) { i = lt + 1; continue; }
    // Find the end of this tag, ignoring ">" inside a quoted value.
    let k = j;
    let quote = null;
    let end = -1;
    while (k < n) {
      const c = html[k];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        end = k;
        break;
      }
      k += 1;
    }
    if (end < 0) break;
    if (closing) {
      if (stack.length > 1) stack.pop();
      i = end + 1;
      continue;
    }
    const rawAttrs = html.slice(j, end);
    const selfClose = /\/\s*$/.test(rawAttrs);
    const attrText = selfClose ? rawAttrs.replace(/\/\s*$/, '') : rawAttrs;
    const el = new El(tag);
    for (const [key, val] of parseAttributes(attrText)) {
      el.setAttribute(key, val);
      if (key.indexOf('data-') === 0) el.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClose && !voidTags.has(tag.toLowerCase())) stack.push(el);
    i = end + 1;
  }
}

function makeDocument() {
  const html = new El('html');
  const head = new El('head');
  const body = new El('body');
  html.appendChild(head);
  html.appendChild(body);
  return {
    documentElement: html,
    head,
    body,
    createElement: (t) => new El(t),
    getElementById: (id) => { for (const el of html.walk()) if (el.id === id) return el; return null; },
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    addEventListener() {},
    dispatchEvent() {},
  };
}

function makeSandbox(doc, extra = {}) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    document: doc,
    localStorage: {
      _d: Object.create(null),
      getItem(k) { return k in this._d ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
    },
    fetch: extra.fetch || (async () => ({ ok: false, status: 501, json: async () => ({}) })),
    AbortController,
    crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 11) & 0xff; return arr; } },
    navigator: { clipboard: { writeText: async () => {} } },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    escape: (s) => s,
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o || {}); } },
    WebSocket: { OPEN: 1 },
    API_BASE: 'https://fibemate.net/api',
    escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    formatTime: (t) => String(t),
    showToast: () => {},
    ...extra,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadModule(sandbox, file, exportExpr) {
  const code = fs.readFileSync(path.join(SRC, file), 'utf8');
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx, { filename: file });
  // Top-level `const` does not land on the context object the way a function
  // declaration does; ask the context for the binding explicitly.
  if (exportExpr) return vm.runInContext(exportExpr, ctx, { filename: file + '#export' });
  return undefined;
}


// ──────────────────────────────────────────────────────────────── checks ──
// The website's 2FA module mounts its overlay after rendering, so every render
// helper looked up nodes in a detached tree and got null. Two symptoms, both
// silent: "Enable 2FA" threw on twofaSecretDisplay and showed nothing at all,
// and the Disable / Login dialogs appeared with dead buttons.

const asyncErrors = [];
process.on('unhandledRejection', (e) => asyncErrors.push(e));

function sandboxFor(doc, calls, enabled) {
  return makeSandbox(doc, {
    fetch: async (url, opts = {}) => {
      const u = String(url);
      calls.push({ url: u, body: opts.body });
      if (u.endsWith('/auth/2fa/status')) return { ok: true, status: 200, json: async () => ({ enabled }) };
      if (u.endsWith('/auth/2fa/disable')) return { ok: true, status: 200, json: async () => ({}) };
      if (u.endsWith('/auth/2fa/verify-login')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      if (u.endsWith('/auth/2fa/enable')) return { ok: true, status: 200, json: async () => ({ recoveryCodes: ['AAAA-AAAA'] }) };
      return { ok: false, status: 404, json: async () => ({}) };
    },
  });
}

async function boot(enabled) {
  const doc = makeDocument();
  const shell = doc.createElement('div');
  shell.id = 'settingsSections';
  doc.body.appendChild(shell);
  const calls = [];
  const sandbox = sandboxFor(doc, calls, enabled);
  sandbox.localStorage.setItem('fk_token', 'T');
  sandbox.localStorage.setItem('fk_uname', 'alice');
  const api = loadModule(sandbox, 'modules/two-factor-auth.js', 'TwoFactorAuth');
  api.init();
  await wait(700); // _addSettingsSection defers 500ms; status check resolves sooner
  return { doc, calls, api };
}

const overlays = (doc) => Array.from(doc.body.walk()).filter((el) => String(el.className).split(/\s+/).includes('modal-overlay'));
const text = (el) => (el ? String(el.textContent || '') : '');
// The shim keeps parsed text in child nodes rather than in a nested element's
// innerHTML, so read the section template, which the module sets as a string.
const sectionHTML = (doc) => {
  const section = doc.getElementById('twofaSettingsSection');
  return section ? section.innerHTML : '';
};

check('Enable 2FA opens a filled step 1 and its buttons work', async () => {
  asyncErrors.length = 0;
  const { doc } = await boot(false);
  const toggle = doc.getElementById('btnToggle2FA');
  assert(toggle, 'settings section never rendered a toggle button');
  assert(/Enable 2FA/.test(sectionHTML(doc)), 'toggle should offer Enable 2FA, got ' + JSON.stringify(sectionHTML(doc).slice(0, 120)));

  toggle.click();
  await wait(30);
  assert(asyncErrors.length === 0, 'clicking Enable 2FA threw: ' + (asyncErrors[0] && asyncErrors[0].message));
  assert(overlays(doc).length === 1, 'no dialog is on screen after clicking Enable 2FA');

  const secret = doc.getElementById('twofaSecretDisplay');
  assert(secret, 'step 1 rendered without the secret slot');
  assert(text(secret) && text(secret) !== 'Loading...', 'the secret key was never written: ' + JSON.stringify(text(secret)));

  const next = doc.getElementById('btn2FANext');
  assert(next, 'step 1 has no Next button');
  next.click();
  assert(doc.getElementById('twofaCodeInput'), 'Next did nothing: step 2 did not render');

  const back = doc.getElementById('btn2FABack');
  assert(back, 'step 2 has no Back button');
  back.click();
  assert(doc.getElementById('twofaSecretDisplay'), 'Back did nothing: step 1 did not come back');

  doc.getElementById('btn2FACancel').click();
  assert(overlays(doc).length === 0, 'Cancel did not close the dialog');
});

check('Disable 2FA wires both buttons and reaches the API', async () => {
  asyncErrors.length = 0;
  const { doc, calls } = await boot(true);
  const toggle = doc.getElementById('btnToggle2FA');
  assert(toggle, 'settings section never rendered a toggle button');
  assert(/Disable 2FA/.test(sectionHTML(doc)), 'toggle should offer Disable 2FA, got ' + JSON.stringify(sectionHTML(doc).slice(0, 120)));

  toggle.click();
  assert(overlays(doc).length === 1, 'no dialog is on screen after clicking Disable 2FA');
  const cancel = doc.getElementById('btn2FACancelDisable');
  assert(cancel, 'disable dialog has no Cancel button');
  cancel.click();
  assert(overlays(doc).length === 0, 'Cancel in the disable dialog did nothing (handler not bound)');

  toggle.click();
  const confirm = doc.getElementById('btn2FAConfirmDisable');
  assert(confirm, 'disable dialog has no confirm button');
  confirm.click();
  await wait(50);
  assert(calls.some((c) => c.url.endsWith('/auth/2fa/disable')), 'Disable 2FA never reached the API (handler not bound)');
});

check('Login 2FA wires Cancel and Verify', async () => {
  asyncErrors.length = 0;
  const { doc, calls, api } = await boot(false);
  api.showLogin2FA('alice', () => {});
  assert(overlays(doc).length === 1, 'login dialog was not mounted');
  doc.getElementById('btn2FACancelLogin').click();
  assert(overlays(doc).length === 0, 'Cancel in the login dialog did nothing (handler not bound)');

  api.showLogin2FA('alice', () => {});
  const verify = doc.getElementById('btn2FAVerifyLogin');
  assert(verify, 'login dialog has no Verify button');
  verify.click();
  await wait(50);
  assert(calls.some((c) => c.url.endsWith('/auth/2fa/verify-login')), 'Verify never reached the API (handler not bound)');
});

(async () => {
  for (const [name, fn] of checks) {
    try {
      await fn();
      console.log('PASS ' + name);
    } catch (e) {
      failures += 1;
      console.log('FAIL ' + name + ' :: ' + (e && e.message ? e.message : e));
    }
  }
  console.log(failures === 0 ? 'ALL PASS (' + checks.length + ' checks)' : failures + ' check(s) failed');
  process.exit(failures === 0 ? 0 : 1);
})();
