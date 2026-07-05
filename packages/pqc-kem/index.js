/**
 * @fibemate/pqc-kem — ML-KEM-768 (FIPS 203) pure JavaScript implementation.
 */

const core = require('./src/ml-kem-768');

module.exports = {
    generateKeypair: core.generateKeypair,
    encapsulate: core.encapsulate,
    decapsulate: core.decapsulate,
    HybridKeyExchange: require('./src/hybrid').HybridKeyExchange,
    // Constants
    PUBLIC_KEY_BYTES: core.PUBLIC_KEY_BYTES,
    SECRET_KEY_BYTES: core.SECRET_KEY_BYTES,
    CIPHERTEXT_BYTES: core.CIPHERTEXT_BYTES,
    SHARED_SECRET_BYTES: core.SHARED_SECRET_BYTES,
    // Low-level API (for testing/auditing)
    compress: core.compress,
    decompress: core.decompress,
    byteEncode: core.byteEncode,
    byteDecode: core.byteDecode,
    polyMul: core.polyMul,
    vecAdd: core.vecAdd,
    vecDot: core.vecDot,
    matVecMul: core.matVecMul,
    modAdd: core.modAdd,
    modSub: core.modSub,
    modMul: core.modMul,
    samplePoly: core.samplePoly,
    sha3_256: core.sha3_256,
    sha3_512: core.sha3_512,
    shake128: core.shake128,
    shake256: core.shake256
};