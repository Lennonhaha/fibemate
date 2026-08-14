// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE E2E Tests - Messaging Flow
 * Tests: Send/Receive Messages, E2EE, File Transfer, Voice Messages
 */

describe('Messaging', () => {
  const BASE_URL = 'http://localhost:3000';
  const API_URL = window.location.origin + '/api';
  
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit(`${BASE_URL}/login.html`);
    
    // Login
    cy.get('#loginUsername').type('testuser');
    cy.get('#loginPassword').type('testpass123');
    cy.get('#btnLogin').click();
    
    cy.url().should('include', 'main.html', { timeout: 10000 });
  });

  describe('Message Sending', () => {
    it('should send a text message', () => {
      cy.intercept('POST', `${API_URL}/messages`).as('sendMessage');
      
      // Open a conversation
      cy.get('.conversation-item').first().click();
      
      // Type and send
      cy.get('#messageInput').type('Hello E2E Test');
      cy.get('#btnSend').click();
      
      cy.wait('@sendMessage').its('response.statusCode').should('eq', 200);
      cy.get('.message-bubble').should('contain', 'Hello E2E Test');
    });

    it('should show message status indicators', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#messageInput').type('Status Test');
      cy.get('#btnSend').click();
      
      // Check for sent/delivered/read indicators
      cy.get('.message-status', { timeout: 5000 }).should('exist');
    });

    it('should not send empty messages', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#btnSend').click();
      cy.get('.toast-error').should('contain', '消息不能为空');
    });

    it('should support emoji and unicode', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#messageInput').type('🔒 安全消息 你好');
      cy.get('#btnSend').click();
      
      cy.get('.message-bubble').should('contain', '🔒');
    });
  });

  describe('End-to-End Encryption', () => {
    it('should encrypt messages before sending', () => {
      cy.intercept('POST', `${API_URL}/messages`, (req) => {
        expect(req.body).to.have.property('envelope');
        expect(req.body.envelope).to.have.property('ciphertext');
        expect(req.body.envelope).to.have.property('ephemeralPublicKey');
      }).as('encryptedMessage');
      
      cy.get('.conversation-item').first().click();
      cy.get('#messageInput').type('Secret message');
      cy.get('#btnSend').click();
      
      cy.wait('@encryptedMessage');
    });

    it('should decrypt received messages', () => {
      // Mock incoming encrypted message
      cy.window().then((win) => {
        win.wsManager?.emit('new_message', {
          from: 'peer123',
          envelope: JSON.stringify({
            protocol: 'x3dh',
            ciphertext: 'encrypted_data_here',
            ephemeralPublicKey: 'epk_test'
          }),
          createdAt: Date.now()
        });
      });
      
      cy.get('.message-bubble', { timeout: 5000 }).should('exist');
    });
  });

  describe('File Transfer', () => {
    it('should upload and send a file', () => {
      cy.intercept('POST', `${API_URL}/messages/file`).as('fileUpload');
      
      cy.get('.conversation-item').first().click();
      
      // Attach file
      cy.get('#fileInput').attachFile('fixtures/test-file.txt');
      cy.get('#btnSend').click();
      
      cy.wait('@fileUpload', { timeout: 15000 }).its('response.statusCode').should('eq', 200);
      cy.get('.file-message').should('be.visible');
    });

    it('should show file upload progress', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#fileInput').attachFile('fixtures/large-file.zip');
      
      cy.get('.upload-progress').should('be.visible');
    });

    it('should handle file too large error', () => {
      cy.intercept('POST', `${API_URL}/messages/file`, {
        statusCode: 413,
        body: { error: 'File too large' }
      }).as('largeFile');
      
      cy.get('.conversation-item').first().click();
      cy.get('#fileInput').attachFile('fixtures/large-file.zip');
      
      cy.wait('@largeFile');
      cy.get('.toast-error').should('contain', '文件过大');
    });
  });

  describe('Voice Messages', () => {
    it('should start voice recording', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#btnVoiceMsg').click();
      
      cy.get('#btnVoiceMsg').should('have.class', 'recording');
      cy.get('.toast-info').should('contain', '录音中');
    });

    it('should stop voice recording on second click', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#btnVoiceMsg').click();
      cy.wait(1000);
      cy.get('#btnVoiceMsg').click();
      
      cy.get('#btnVoiceMsg').should('not.have.class', 'recording');
    });

    it('should send voice message after recording', () => {
      cy.intercept('POST', `${API_URL}/messages/voice`).as('voiceMessage');
      
      cy.get('.conversation-item').first().click();
      cy.get('#btnVoiceMsg').click();
      cy.wait(2000);
      cy.get('#btnVoiceMsg').click();
      
      cy.wait('@voiceMessage', { timeout: 10000 }).its('response.statusCode').should('eq', 200);
    });
  });

  describe('Message Search', () => {
    it('should open search panel', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#btnSearchMsg').click();
      
      cy.get('.search-panel').should('be.visible');
    });

    it('should find messages by keyword', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#btnSearchMsg').click();
      
      cy.get('#searchInput').type('test');
      cy.get('#btnSearchExecute').click();
      
      cy.get('.search-results').should('be.visible');
    });
  });

  describe('Burn Mode', () => {
    it('should toggle burn mode', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#btnBurn').click();
      
      cy.get('#btnBurn').should('have.class', 'active');
      cy.get('.burn-indicator').should('be.visible');
    });

    it('should send self-destructing message', () => {
      cy.get('.conversation-item').first().click();
      cy.get('#btnBurn').click();
      
      cy.get('#messageInput').type('Self destruct');
      cy.get('#btnSend').click();
      
      cy.get('.message-bubble.burn-mode').should('exist');
    });
  });
});
