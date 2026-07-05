/**
 * FIBEMATE Cypress Custom Commands
 */

// Login command
Cypress.Commands.add('login', (username, password) => {
  cy.session([username, password], () => {
    cy.visit('/login.html');
    cy.get('#loginUsername').type(username);
    cy.get('#loginPassword').type(password);
    cy.get('#btnLogin').click();
    cy.url().should('include', 'main.html');
  }, {
    validate() {
      cy.window().its('localStorage.fk_token').should('exist');
    }
  });
});

// ZK Login command
Cypress.Commands.add('zkLogin', (username) => {
  cy.visit('/login.html');
  cy.get('#btnZKLogin').click();
  cy.get('#zkProofModal').should('be.visible');
  
  // Wait for proof generation
  cy.get('#zkProofStatus', { timeout: 30000 }).should('contain', '证明生成完成');
  cy.get('#btnZKSubmit').click();
  
  cy.url().should('include', 'main.html');
});

// Send message command
Cypress.Commands.add('sendMessage', (content) => {
  cy.get('#messageInput').clear().type(content);
  cy.get('#btnSend').click();
  cy.get('.message-bubble').should('contain', content);
});

// Open conversation command
Cypress.Commands.add('openConversation', (peerName) => {
  cy.get('.conversation-item').contains(peerName).click();
  cy.get('#chatWindow').should('be.visible');
});

// Mock WebSocket message
Cypress.Commands.add('mockWSMessage', (message) => {
  cy.window().then((win) => {
    if (win.wsManager) {
      win.wsManager.emit('new_message', message);
    }
  });
});

// Wait for toast
Cypress.Commands.add('waitForToast', (type, message) => {
  cy.get(`.toast-${type}`).should('contain', message);
});

// Check encryption indicator
Cypress.Commands.add('checkEncrypted', () => {
  cy.get('.encryption-indicator').should('be.visible');
  cy.get('.encryption-indicator').should('have.class', 'encrypted');
});

// Mock API response
Cypress.Commands.add('mockAPI', (method, url, response) => {
  cy.intercept(method, `${Cypress.env('apiBaseUrl')}${url}`, response).as('mockedRequest');
});
