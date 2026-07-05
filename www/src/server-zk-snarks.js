/**
 * FIBEMATE ZK-SNARKs Server-Side Verification
 * 
 * Verifies Groth16 proofs from the client using snarkjs
 * This module adds /auth/register-zk-snarks and /auth/login-zk-snarks routes
 * 
 * Usage:
 *   const zkSnarksRoutes = require('./server-zk-snarks');
 *   app.use('/api', zkSnarksRoutes);
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// ========== ZK-SNARKs Verification ==========

let vKey = null;
let snarkjs = null;

/**
 * Initialize snarkjs and load verification key
 */
async function initZKSnarks() {
    try {
        // Load snarkjs
        snarkjs = require('snarkjs');
        
        // Load verification key
        const vKeyPath = path.join(__dirname, 'circuits', 'build', 'setup', 'verification_key.json');
        if (fs.existsSync(vKeyPath)) {
            vKey = JSON.parse(fs.readFileSync(vKeyPath, 'utf8'));
            console.log('[ZK-SNARKs] Verification key loaded from:', vKeyPath);
        } else {
            console.warn('[ZK-SNARKs] WARNING: Verification key not found at:', vKeyPath);
            console.warn('[ZK-SNARKs] ZK-SNARKs authentication will not work until circuit is compiled.');
        }
    } catch (error) {
        console.warn('[ZK-SNARKs] Initialization failed:', error.message);
        console.warn('[ZK-SNARKs] Install snarkjs: npm install snarkjs');
    }
}

// Initialize on load
initZKSnarks();

/**
 * Verify a Groth16 ZK-SNARKs proof
 * 
 * @param {Object} proof - The Groth16 proof object
 * @param {Array} publicSignals - The public signals array
 * @returns {Promise<{valid: boolean, commitment?: string, error?: string}>}
 */
async function verifyZKProof(proof, publicSignals) {
    if (!vKey || !snarkjs) {
        return { valid: false, error: 'ZK-SNARKs not initialized (verification key missing)' };
    }
    
    try {
        // Verify the proof using snarkjs
        const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        
        if (!isValid) {
            return { valid: false, error: 'ZK proof verification failed' };
        }
        
        // Extract commitment from public signals
        // For ZKIdentityProof circuit, publicSignals[0] = expectedCommitment
        const commitment = publicSignals[0];
        
        return {
            valid: true,
            commitment: commitment
        };
    } catch (error) {
        console.error('[ZK-SNARKs] Verification error:', error);
        return { valid: false, error: error.message };
    }
}

// ========== In-Memory Database (replace with PostgreSQL in production) ==========

const users = new Map();      // commitment -> { userId, commitment, createdAt, lastLogin }
const sessions = new Map();   // token -> { userId, commitment, createdAt }
const nullifiers = new Map(); // nullifierHash -> true (for double-registration detection)

// ========== JWT Token Generation (simplified) ==========

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

function generateToken(userId) {
    const payload = {
        userId: userId,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
    };
    // Simplified token - in production, use proper JWT library
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', JWT_SECRET)
        .update(header + '.' + body)
        .digest('base64url');
    return header + '.' + body + '.' + signature;
}

function verifyToken(token) {
    try {
        const [header, body, signature] = token.split('.');
        const expectedSig = crypto.createHmac('sha256', JWT_SECRET)
            .update(header + '.' + body)
            .digest('base64url');
        if (signature !== expectedSig) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

// ========== Auth Middleware ==========

function authenticateZK(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = payload;
    next();
}

// ========== Routes ==========

/**
 * POST /auth/register-zk-snarks
 * 
 * Register a new user with ZK-SNARKs proof
 * Body: { commitment, proof, publicSignals }
 * 
 * The proof proves knowledge of username_hash and salt
 * WITHOUT revealing them to the server.
 */
router.post('/auth/register-zk-snarks', async (req, res) => {
    try {
        const { commitment, proof, publicSignals } = req.body;
        
        // 1. Validate input
        if (!commitment || !proof || !publicSignals) {
            return res.status(400).json({ error: 'Missing required fields: commitment, proof, publicSignals' });
        }
        
        // 2. Verify ZK proof
        const result = await verifyZKProof(proof, publicSignals);
        
        if (!result.valid) {
            return res.status(400).json({ error: 'Invalid ZK proof: ' + (result.error || 'verification failed') });
        }
        
        // 3. Verify commitment matches
        const proofCommitment = '0x' + BigInt(result.commitment).toString(16).padStart(64, '0');
        if (proofCommitment !== commitment && result.commitment.toString() !== commitment) {
            // Try different formats
            const commitmentBigInt = commitment.startsWith('0x') ? BigInt(commitment) : BigInt('0x' + commitment);
            if (BigInt(result.commitment) !== commitmentBigInt) {
                return res.status(400).json({ error: 'Commitment in proof does not match provided commitment' });
            }
        }
        
        // 4. Check if commitment already exists (prevents duplicate registration)
        if (users.has(commitment)) {
            return res.status(409).json({ error: 'Identity already registered' });
        }
        
        // 5. Create user (NO username stored! Only commitment)
        const userId = crypto.randomUUID();
        const user = {
            userId: userId,
            commitment: commitment,
            createdAt: new Date().toISOString(),
            lastLogin: null,
            authMethod: 'zk-snarks-groth16'
        };
        users.set(commitment, user);
        
        // 6. Generate token
        const token = generateToken(userId);
        sessions.set(token, { userId, commitment, createdAt: new Date().toISOString() });
        
        console.log('[ZK-SNARKs] New user registered:', userId, 'commitment:', commitment.substring(0, 16) + '...');
        
        res.json({
            success: true,
            userId: userId,
            token: token,
            displayName: 'User_' + userId.substring(0, 8), // Anonymous display name
            authMethod: 'zk-snarks-groth16'
        });
        
    } catch (error) {
        console.error('[ZK-SNARKs] Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /auth/login-zk-snarks
 * 
 * Login with ZK-SNARKs proof
 * Body: { commitment, proof, publicSignals, timestamp }
 * 
 * The proof proves knowledge of the preimage of the commitment
 * WITHOUT revealing username or salt.
 */
router.post('/auth/login-zk-snarks', async (req, res) => {
    try {
        const { commitment, proof, publicSignals, timestamp } = req.body;
        
        // 1. Validate input
        if (!commitment || !proof || !publicSignals) {
            return res.status(400).json({ error: 'Missing required fields: commitment, proof, publicSignals' });
        }
        
        // 2. Check timestamp (prevent replay attacks, 5 minute window)
        if (timestamp) {
            const now = Date.now();
            const diff = Math.abs(now - timestamp);
            if (diff > 5 * 60 * 1000) {
                return res.status(400).json({ error: 'Request timestamp too old or in future' });
            }
        }
        
        // 3. Verify ZK proof
        const result = await verifyZKProof(proof, publicSignals);
        
        if (!result.valid) {
            return res.status(400).json({ error: 'Invalid ZK proof: ' + (result.error || 'verification failed') });
        }
        
        // 4. Verify commitment matches
        const commitmentBigInt = commitment.startsWith('0x') ? BigInt(commitment) : BigInt('0x' + commitment);
        if (BigInt(result.commitment) !== commitmentBigInt) {
            return res.status(400).json({ error: 'Commitment in proof does not match provided commitment' });
        }
        
        // 5. Check if user exists
        const user = users.get(commitment);
        if (!user) {
            return res.status(404).json({ error: 'Identity not registered. Please register first.' });
        }
        
        // 6. Update last login
        user.lastLogin = new Date().toISOString();
        
        // 7. Generate token
        const token = generateToken(user.userId);
        sessions.set(token, { userId: user.userId, commitment, createdAt: new Date().toISOString() });
        
        console.log('[ZK-SNARKs] User logged in:', user.userId);
        
        res.json({
            success: true,
            userId: user.userId,
            token: token,
            displayName: 'User_' + user.userId.substring(0, 8),
            authMethod: 'zk-snarks-groth16'
        });
        
    } catch (error) {
        console.error('[ZK-SNARKs] Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /auth/zk-snarks/status
 * Check if ZK-SNARKs authentication is available
 */
router.get('/auth/zk-snarks/status', (req, res) => {
    res.json({
        available: vKey !== null && snarkjs !== null,
        authMethod: 'zk-snarks-groth16',
        circuitCompiled: vKey !== null,
        snarkjsLoaded: snarkjs !== null,
        registeredUsers: users.size
    });
});

/**
 * GET /auth/zk-snarks/verification-key
 * Serve the verification key (this is public information)
 */
router.get('/auth/zk-snarks/verification-key', (req, res) => {
    if (!vKey) {
        return res.status(404).json({ error: 'Verification key not available. Circuit not compiled yet.' });
    }
    res.json(vKey);
});

module.exports = router;
module.exports.verifyZKProof = verifyZKProof;
module.exports.initZKSnarks = initZKSnarks;
