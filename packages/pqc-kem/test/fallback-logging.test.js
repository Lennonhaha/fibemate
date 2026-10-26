// SPDX-License-Identifier: Apache-2.0
// Controls for #348: a rejected native addon must leave a trace, and a missing
// addon must stay quiet (Windows and JS-only installs are supported setups).
const assert = require('assert');
const Module = require('module');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');

function addonThatThrows(err) {
    const fail = () => { throw err; };
    return { keygen: fail, encaps: fail, decaps: fail };
}

function rngError() {
    const e = new Error('randombytes failed: operating system entropy source unavailable');
    e.code = 'ERR_RNG_FAILURE';
    return e;
}

// 1. Self-test failure: addon loads, then throws on keygen.
{
    const { native, fallback } = require(indexPath).detectNative({
        require: () => addonThatThrows(rngError()),
        exists: () => true,
    });
    assert.strictEqual(native, null, 'a failing self-test must reject the addon');
    assert.strictEqual(fallback.stage, 'self-test');
    assert.strictEqual(fallback.code, 'ERR_RNG_FAILURE');
    console.log('PASS  self-test failure is recorded as self-test/ERR_RNG_FAILURE');
}

// 2. Missing addon: quiet, because that is a supported configuration.
{
    const { native, fallback } = require(indexPath).detectNative({
        require: () => { const e = new Error('Cannot find module'); e.code = 'MODULE_NOT_FOUND'; throw e; },
        exists: () => false,
    });
    assert.strictEqual(native, null);
    assert.strictEqual(fallback, null, 'an absent addon must not produce a fallback reason');
    console.log('PASS  absent addon is silent');
}

// 3. Addon present but unloadable: reported as a load failure.
{
    const { fallback } = require(indexPath).detectNative({
        require: () => { const e = new Error('invalid ELF header'); e.code = 'ERR_DLOPEN_FAILED'; throw e; },
        exists: () => true,
    });
    assert.strictEqual(fallback.stage, 'load');
    assert.strictEqual(fallback.code, 'ERR_DLOPEN_FAILED');
    console.log('PASS  load failure is reported');
}

// 4. End to end: requiring the module emits one FIBEMATE_PQC_KEM_JS_FALLBACK warning.
{
    const warnings = [];
    const onWarning = (w) => warnings.push(w);
    process.on('warning', onWarning);

    const originalRequire = Module.prototype.require;
    Module.prototype.require = function (request) {
        if (typeof request === 'string' && request.endsWith('mlkem.node')) {
            return addonThatThrows(rngError());
        }
        return originalRequire.apply(this, arguments);
    };

    delete require.cache[require.resolve(indexPath)];
    let pkg;
    try {
        pkg = require(indexPath);
    } finally {
        Module.prototype.require = originalRequire;
    }

    setImmediate(() => {
        process.removeListener('warning', onWarning);
        assert.strictEqual(pkg.usingNative, false);
        assert(pkg.nativeFallback, 'module must expose why it fell back');
        assert.strictEqual(pkg.nativeFallback.stage, 'self-test');
        const w = warnings.find((x) => x.code === 'FIBEMATE_PQC_KEM_JS_FALLBACK');
        assert(w, 'expected one FIBEMATE_PQC_KEM_JS_FALLBACK warning');
        assert(/self-test/.test(w.message) && /ERR_RNG_FAILURE/.test(w.message),
            'warning must name the stage and the error code, got: ' + w.message);
        console.log('PASS  require-time downgrade emits FIBEMATE_PQC_KEM_JS_FALLBACK');
    });
}
