// SPDX-License-Identifier: GPL-3.0-only
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    apiUrl: 'window.location.origin + '/api'',
    setupNodeEvents(on, config) {
      // Implement node event listeners here
      on('task', {
        log(message) {
          console.log(message);
          return null;
        }
      });
    },
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 15000,
    env: {
      testUser: 'testuser',
      testPassword: 'testpass123',
      apiBaseUrl: 'window.location.origin + '/api''
    },
    supportFile: 'cypress/support/e2e.js'
  },
  component: {
    devServer: {
      framework: 'vanilla',
      bundler: 'vite'
    }
  }
});
