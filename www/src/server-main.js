const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..')));

const zkSnarksRoutes = require('./server-zk-snarks');
app.use('/api', zkSnarksRoutes);

const basicAuthRoutes = require("./server-auth-basic");
const nexusRoutes = require('./server-nexus-api');
app.use('/api', basicAuthRoutes);
app.use('/api', nexusRoutes);

const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
    console.log('[WebSocket] Client connected from', req.socket.remoteAddress);
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('[WebSocket] Received:', data.type);
            ws.send(JSON.stringify({ type: 'echo', data }));
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
    });
    
    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
    });
    
    ws.on('error', (err) => {
        console.error('[WebSocket] Error:', err.message);
    });
    
    ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        features: {
            zkSnarks: true,
            nexus: true,
            websocket: true
        }
    });
});

app.use((err, req, res, next) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log('========================================');
    console.log('  FIBEMATE Server v2.0');
    console.log('========================================');
    console.log('  HTTP:  http://localhost:' + PORT);
    console.log('  WS:    ws://localhost:' + PORT + '/ws');
    console.log('');
    console.log('  Endpoints:');
    console.log('    POST /api/auth/register-zk-snarks');
    console.log('    POST /api/auth/login-zk-snarks');
    console.log('    GET  /api/auth/zk-snarks/status');
    console.log('    GET  /api/health');
    console.log('========================================');
});

module.exports = { app, server };
