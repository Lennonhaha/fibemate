#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * EXPERIMENTAL �?仿真非生�? * 此模块为 Mixnet 实验性代码，未经生产审计
 * 请勿用于关键路径或主�? */


// SPDX-License-Identifier: GPL-3.0-only

const http = require('http');
const { execSync } = require('child_process');

// 解析命令行参�?const args = require('minimist')(process.argv.slice(2));
const PORT = parseInt(args.port) || 8001;

// 发送健康检查请�?const options = {
  hostname: 'localhost',
  port: PORT,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log(`[Healthcheck] Node ${PORT} is healthy`);
      console.log(`[Healthcheck] Response: ${data}`);
      process.exit(0); // 健康
    } else {
      console.error(`[Healthcheck] Node ${PORT} returned ${res.statusCode}`);
      process.exit(1); // 不健�?    }
  });
});

req.on('error', (error) => {
  console.error(`[Healthcheck] Node ${PORT} is unhealthy: ${error.message}`);
  process.exit(1); // 不健�?});

req.on('timeout', () => {
  console.error(`[Healthcheck] Node ${PORT} timeout after 5s`);
  req.destroy();
  process.exit(1); // 不健�?});

req.end();
