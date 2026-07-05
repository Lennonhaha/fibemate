/**
 * FIBEMATE KAT (Known Answer Test) 测试套件
 * 验证密码学实现的正确性
 */

const crypto = require('crypto');
const fs = require('fs');

class KATTestSuite {
    constructor() {
        this.results = [];
        this.passed = 0;
        this.failed = 0;
    }

    log(test, expected, actual, status) {
        const result = {
            test,
            expected: expected?.substring(0, 64) + '...',
            actual: actual?.substring(0, 64) + '...',
            status
        };
        this.results.push(result);
        if (status === 'PASS') this.passed++;
        else this.failed++;
        console.log(`[${status}] ${test}`);
    }

    // 1. AES-GCM 加密测试向量
    async testAESGCM() {
        const key = Buffer.from('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f', 'hex');
        const iv = Buffer.from('000102030405060708090a0b', 'hex');
        const plaintext = Buffer.from('Hello FIBEMATE KAT', 'utf8');
        const aad = Buffer.from('authenticated data', 'utf8');

        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(aad);
        let ciphertext = cipher.update(plaintext);
        ciphertext = Buffer.concat([ciphertext, cipher.final()]);
        const tag = cipher.getAuthTag();

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        decipher.setAAD(aad);
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        const pass = decrypted.toString('utf8') === plaintext.toString('utf8');
        this.log('AES-256-GCM 加密/解密', plaintext.toString('hex'), decrypted.toString('hex'), pass ? 'PASS' : 'FAIL');
        return pass;
    }

    // 2. SHA-256 哈希测试向量
    testSHA256() {
        const testVectors = [
            { input: '', expected: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
            { input: 'abc', expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
            { input: 'FIBEMATE', expected: null } // 将计算并输出
        ];

        let allPass = true;
        for (const tv of testVectors) {
            const hash = crypto.createHash('sha256').update(tv.input).digest('hex');
            if (tv.expected) {
                const pass = hash === tv.expected;
                this.log(`SHA-256("${tv.input}")`, tv.expected, hash, pass ? 'PASS' : 'FAIL');
                if (!pass) allPass = false;
            } else {
                this.log(`SHA-256("${tv.input}")`, '计算值', hash, 'INFO');
            }
        }
        return allPass;
    }

    // 3. HMAC-SHA256 测试
    testHMAC() {
        const key = Buffer.from('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b', 'hex');
        const data = 'Hi There';
        const expected = 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7';

        const hmac = crypto.createHmac('sha256', key).update(data).digest('hex');
        const pass = hmac === expected;
        this.log('HMAC-SHA256 (RFC 4231)', expected, hmac, pass ? 'PASS' : 'FAIL');
        return pass;
    }

    // 4. PBKDF2 密钥派生测试
    testPBKDF2() {
        const password = 'password';
        const salt = Buffer.from('salt', 'utf8');
        const iterations = 1;
        const keylen = 32;
        const expected = '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b';

        const derived = crypto.pbkdf2Sync(password, salt, iterations, keylen, 'sha256').toString('hex');
        const pass = derived === expected;
        this.log('PBKDF2-HMAC-SHA256 (RFC 6070)', expected, derived, pass ? 'PASS' : 'FAIL');
        return pass;
    }

    // 5. ECDH 密钥交换测试
    testECDH() {
        const alice = crypto.createECDH('secp256k1');
        const bob = crypto.createECDH('secp256k1');

        alice.generateKeys();
        bob.generateKeys();

        const aliceSecret = alice.computeSecret(bob.getPublicKey());
        const bobSecret = bob.computeSecret(alice.getPublicKey());

        const pass = aliceSecret.equals(bobSecret);
        this.log('ECDH 密钥交换', aliceSecret.toString('hex').substring(0, 32) + '...', bobSecret.toString('hex').substring(0, 32) + '...', pass ? 'PASS' : 'FAIL');
        return pass;
    }

    // 6. 随机数生成测试
    testRandom() {
        const random1 = crypto.randomBytes(32).toString('hex');
        const random2 = crypto.randomBytes(32).toString('hex');
        const pass = random1 !== random2 && random1.length === 64;
        this.log('CSPRNG 随机数生成', '唯一且64字符', random1.substring(0, 32) + '...', pass ? 'PASS' : 'FAIL');
        return pass;
    }

    // 7. JWT 签名验证测试
    testJWT() {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ sub: 'test', iat: Math.floor(Date.now() / 1000) })).toString('base64url');
        const secret = 'test-secret';

        const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
        const jwt = `${header}.${payload}.${signature}`;

        const parts = jwt.split('.');
        const verifySig = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
        const pass = verifySig === parts[2];
        this.log('JWT HMAC-SHA256 签名', signature.substring(0, 32) + '...', verifySig.substring(0, 32) + '...', pass ? 'PASS' : 'FAIL');
        return pass;
    }

    // 8. 证书验证测试
    testCertificate() {
        try {
            const certPath = '/opt/fibemate-full/certs/fullchain.pem';
            if (!fs.existsSync(certPath)) {
                this.log('TLS 证书验证', '文件存在', '文件不存在', 'SKIP');
                return true; // 跳过，非失败
            }
            const cert = fs.readFileSync(certPath);
            const x509 = new crypto.X509Certificate(cert);
            const now = new Date();
            const valid = now >= x509.validFromDate && now <= x509.validToDate;
            this.log('TLS 证书有效期', '当前时间在有效期内', `${x509.validFromDate.toISOString()} ~ ${x509.validToDate.toISOString()}`, valid ? 'PASS' : 'FAIL');
            return valid;
        } catch (e) {
            this.log('TLS 证书验证', '验证成功', e.message, 'FAIL');
            return false;
        }
    }

    async runAll() {
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log('║     FIBEMATE KAT (Known Answer Test) 测试套件           ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        await this.testAESGCM();
        this.testSHA256();
        this.testHMAC();
        this.testPBKDF2();
        this.testECDH();
        this.testRandom();
        this.testJWT();
        this.testCertificate();

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log(`║  测试结果: ${this.passed} 通过 | ${this.failed} 失败 | ${this.results.length} 总计          ║`);
        console.log('╚════════════════════════════════════════════════════════════╝');

        return {
            total: this.results.length,
            passed: this.passed,
            failed: this.failed,
            results: this.results
        };
    }
}

// 运行测试
if (require.main === module) {
    const kat = new KATTestSuite();
    kat.runAll().then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    });
}

module.exports = KATTestSuite;
