// SPDX-License-Identifier: GPL-3.0-only
// FIBEMATE PM2 Ecosystem Config — Template
// ==========================================
// Copy this file to ecosystem.config.js, fill in your values.
// NEVER commit ecosystem.config.js — it contains production secrets.
//
// Usage:
//   cp ecosystem.config.template.js ecosystem.config.js
//   # edit values
//   pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'fibemate',
      script: './src/index.js',
      restart_delay: 3000,
      kill_timeout: 5000,
      max_restarts: 10,
      min_uptime: 5000,
      watch: false,
      env: {
        NODE_ENV: 'production'
        // Add environment variables here:
        // PORT: 3001,
        // DB_URL: 'your-database-url',
        // JWT_SECRET: 'your-secret',
      }
    }
  ]
};
