const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'noir-db.json');
let db = { users: {}, devices: {}, messages: {}, conversations: {}, contacts: {}, presence: {}, securityLogs: [], pendingKeys: {}, screenshotAlerts: {}, _idCounters: {} };

async function main() {
  const userId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const username = 'test';
  const password = 'test123456';
  const hash = await bcrypt.hash(password, 12);
  const now = Date.now();
  const publicKey = crypto.randomBytes(32).toString('hex');

  db.users[userId] = {
    id: userId, username, displayName: 'TestUser',
    passwordHash: hash, publicKey, signedPrekey: publicKey, prekeySignature: '',
    isOnline: 0, hideOnlineStatus: 0, hideReadReceipts: 0,
    screenshotAlert: 0, burnAfterRead: 0, securityScore: 60,
    lastSeen: null, createdAt: now, isTestUser: true, updatedAt: now
  };

  db.devices[deviceId] = {
    id: deviceId, userId, deviceName: 'MobileTest',
    registrationId: crypto.randomInt(1, 65535),
    publicKey, isActive: true, createdAt: now,
    isTestUser: true, lastActive: now
  };

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  console.log('OK user=' + username + ' pass=' + password);
}

main().catch(function(e) { console.error(e); });