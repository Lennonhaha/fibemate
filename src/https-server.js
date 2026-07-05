// https-server.js - HTTPS wrapper for FIBEMATE
const https = require('https');
const http = require('http');
const fs = require('fs');

const CERT_PATH = '/opt/fibemate-full/certs/cert.pem';
const KEY_PATH = '/opt/fibemate-full/certs/key.pem';

function createHttpsServer(app) {
  // HTTP server on 3001 (for internal/redirect)
  const httpServer = http.createServer(app);
  
  // HTTPS server on 3443
  let httpsServer = null;
  try {
    const options = {
      key: fs.readFileSync(KEY_PATH),
      cert: fs.readFileSync(CERT_PATH),
    };
    httpsServer = https.createServer(options, app);
    console.log('[HTTPS] SSL certificates loaded');
  } catch (err) {
    console.error('[HTTPS] Failed to load SSL certs:', err.message);
  }

  httpServer.listen(3001, '0.0.0.0', () => {
    console.log('[HTTP] Listening on port 3001');
  });

  if (httpsServer) {
    httpsServer.listen(3443, '0.0.0.0', () => {
      console.log('[HTTPS] https://8.156.77.68:3443');
    });
  }

  return { httpServer, httpsServer };
}

module.exports = { createHttpsServer };
