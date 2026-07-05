const express = require("express");
const router = express.Router();
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const users = new Map();

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return { hash, salt };
}

function generateToken(userId) {
  const payload = { userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7 * 86400 };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(header + "." + body).digest("base64url");
  return header + "." + body + "." + sig;
}

router.post("/auth/register", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required" });
    if (users.has(username)) return res.status(409).json({ success: false, message: "User already exists" });
    const { hash, salt } = hashPassword(password);
    const userId = crypto.randomUUID();
    users.set(username, { username, passwordHash: hash, salt, userId, createdAt: new Date().toISOString() });
    const token = generateToken(userId);
    console.log("[BasicAuth] Registered:", username, "->", userId);
    res.json({ success: true, token, userId, displayName: username, authMethod: "password" });
  } catch (e) {
    console.error("[BasicAuth] Register error:", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/auth/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, message: "Username and password required" });
    const user = users.get(username);
    if (!user) return res.status(401).json({ success: false, message: "Invalid username or password" });
    const { hash } = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) return res.status(401).json({ success: false, message: "Invalid username or password" });
    const token = generateToken(user.userId);
    console.log("[BasicAuth] Login:", username);
    res.json({ success: true, token, userId: user.userId, displayName: username, authMethod: "password" });
  } catch (e) {
    console.error("[BasicAuth] Login error:", e);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
