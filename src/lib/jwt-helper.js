// SPDX-License-Identifier: GPL-3.0-only
const fs = require('fs');
const path = require('path');

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(__dirname, '..', '..', 'data', '.jwt-secret');
  if (fs.existsSync(secretFile)) {
    const secret = fs.readFileSync(secretFile, 'utf-8').trim();
    if (secret.length >= 32) return secret;
  }
  console.error('FATAL: JWT_SECRET not found in env or data/.jwt-secret');
  process.exit(1);
}

function getJwtSecretFile() {
  return path.join(__dirname, '..', '..', 'data', '.jwt-secret');
}

module.exports = { getJwtSecret, getJwtSecretFile };
