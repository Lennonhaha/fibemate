#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Guard tests for JWT_SECRET resolution (#527).
 *
 * The bug this covers: the file path required >= 32 chars, the env path accepted
 * anything, so production ran with a 10-character secret. Three cases:
 *
 *   1. a short JWT_SECRET in the environment fails startup (loud, non-zero);
 *   2. a 64-hex JWT_SECRET starts the server;
 *   3. FIBEMATE_ENV_FILE can point at a different env file, and a short secret
 *      inside it is rejected the same way.
 */
'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'jwt-guard-'));
}

function start(env, port) {
  const merged = Object.assign({}, process.env, env, { PORT: String(port) });
  // spawn() stringifies values, so 'undefined' must mean "not set at all" here.
  for (const k of Object.keys(env)) if (env[k] === undefined) delete merged[k];
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: merged,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve({ code, out })));
  return { child, exited, dump: () => out };
}

function get(port, p) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', timeout: 2000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function check(name, pass, detail) {
  results.push({ name, pass });
  console.log((pass ? 'ok   ' : 'FAIL ') + name + (detail ? '  [' + detail + ']' : ''));
}

async function waitHealthy(port, child, exited, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if ((await get(port, '/health')) === 200) return true;
    if (child.exitCode !== null) return false;
    await sleep(200);
  }
  return false;
}

(async () => {
  const hex64 = crypto.randomBytes(32).toString('hex');

  // 1. short secret in the environment must fail fast
  {
    const dir = tmpdir();
    const { child, exited, dump } = start(
      { JWT_SECRET: 'tooshort', FIBEMATE_DATA_DIR: path.join(dir, 'data'), FIBEMATE_ENV_FILE: path.join(dir, 'none.env') },
      3981,
    );
    const r = await Promise.race([exited, sleep(20000).then(() => ({ code: null }))]);
    if (child.exitCode === null) child.kill('SIGKILL');
    const said = /at least 32 required/.test(r.out || dump());
    check('short env secret exits non-zero', r.code !== 0 && r.code !== null, 'exit=' + r.code);
    check('short env secret explains the rule', said);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 2. proper secret starts, and /health answers
  {
    const dir = tmpdir();
    const port = 3982;
    const { child, exited } = start(
      { JWT_SECRET: hex64, FIBEMATE_DATA_DIR: path.join(dir, 'data'), FIBEMATE_ENV_FILE: path.join(dir, 'none.env') },
      port,
    );
    const up = await waitHealthy(port, child, exited, 20000);
    check('64-hex env secret boots and serves /health', up, 'port=' + port);
    child.kill('SIGKILL');
    await Promise.race([exited, sleep(3000)]);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // 3. FIBEMATE_ENV_FILE override is honoured, and the guard applies to it too
  {
    const dir = tmpdir();
    const goodEnv = path.join(dir, 'good.env');
    fs.writeFileSync(goodEnv, 'JWT_SECRET=' + hex64 + '\n', 'utf8');
    const port = 3983;
    const a = start({ FIBEMATE_ENV_FILE: goodEnv, FIBEMATE_DATA_DIR: path.join(dir, 'data'), JWT_SECRET: undefined }, port);
    const up = await waitHealthy(port, a.child, a.exited, 20000);
    check('FIBEMATE_ENV_FILE is loaded (server boots)', up, 'port=' + port);
    // If the override were ignored, the app would have generated .jwt-secret instead of using the file.
    check('FIBEMATE_ENV_FILE secret used, no .jwt-secret generated',
      up && !fs.existsSync(path.join(dir, 'data', '.jwt-secret')));
    a.child.kill('SIGKILL');
    await Promise.race([a.exited, sleep(3000)]);

    const badEnv = path.join(dir, 'bad.env');
    fs.writeFileSync(badEnv, 'JWT_SECRET=short-from-file\n', 'utf8');
    const b = start({ FIBEMATE_ENV_FILE: badEnv, FIBEMATE_DATA_DIR: path.join(dir, 'data2'), JWT_SECRET: undefined }, 3984);
    const r = await Promise.race([b.exited, sleep(20000).then(() => ({ code: null }))]);
    if (b.child.exitCode === null) b.child.kill('SIGKILL');
    check('short secret from FIBEMATE_ENV_FILE is rejected', r.code !== 0 && r.code !== null, 'exit=' + r.code);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL exception:', e); process.exit(1); });
