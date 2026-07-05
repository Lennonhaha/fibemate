/**
 * FIBEMATE E2E Support File
 * Loaded before every test
 */

// Import custom commands
import './commands';

// Global test setup
beforeEach(() => {
  // Clear all storage
  cy.clearLocalStorage();
  cy.clearCookies();
  
  // Set viewport
  cy.viewport(1280, 720);
  
  // Mock geolocation if needed
  cy.window().then((win) => {
    cy.stub(win.navigator.geolocation, 'getCurrentPosition').callsFake((cb) => {
      cb({ coords: { latitude: 39.9042, longitude: 116.4074 } });
    });
  });
});

// Handle uncaught exceptions
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent tests from failing on known non-critical errors
  if (err.message.includes('WebSocket')) return false;
  if (err.message.includes('MessageCrypto')) return false;
  if (err.message.includes('wsManager')) return false;
  return true;
});

// Log test info
afterEach(() => {
  cy.window().then((win) => {
    const logs = win.console?.logs || [];
    if (logs.length > 0) {
      cy.task('log', `Console logs: ${JSON.stringify(logs)}`);
    }
  });
});
