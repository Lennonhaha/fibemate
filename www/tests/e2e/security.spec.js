// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE E2E Tests - Security Features
 * Tests: XSS Prevention, CSRF Protection, Rate Limiting, Encryption
 */

describe('Security', () => {
  const BASE_URL = 'http://localhost:3000';
  const API_URL = 'window.location.origin + '/api'';
  
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit(`${BASE_URL}/login.html`);
  });

  describe('XSS Prevention', () => {
    it('should sanitize script tags in messages', () => {
      cy.login('testuser', 'testpass123');
      cy.get('.conversation-item').first().click();
      
      cy.get('#messageInput').type('<script>alert("xss")</script>');
      cy.get('#btnSend').click();
      
      cy.get('.message-bubble').should('contain', '<script>');
      cy.get('.message-bubble script').should('not.exist');
    });

    it('should sanitize event handlers', () => {
      cy.login('testuser', 'testpass123');
      cy.get('.conversation-item').first().click();
      
      cy.get('#messageInput').type('<img onerror="alert(1)" src="x">');
      cy.get('#btnSend').click();
      
      cy.get('.message-bubble img[onerror]').should('not.exist');
    });

    it('should escape HTML entities', () => {
      cy.login('testuser', 'testpass123');
      cy.get('.conversation-item').first().click();
      
      cy.get('#messageInput').type('<b>Bold</b> & "quotes"');
      cy.get('#btnSend').click();
      
      cy.get('.message-bubble').should('contain', '<b>Bold</b>');
    });
  });

  describe('Rate Limiting', () => {
    it('should throttle excessive login attempts', () => {
      // Attempt multiple rapid logins
      for (let i = 0; i < 10; i++) {
        cy.get('#loginUsername').type('user');
        cy.get('#loginPassword').type('wrong');
        cy.get('#btnLogin').click();
        cy.wait(100);
      }
      
      cy.get('.toast-error').should('contain', '请求过于频繁');
    });

    it('should throttle message sending', () => {
      cy.login('testuser', 'testpass123');
      cy.get('.conversation-item').first().click();
      
      // Send many messages rapidly
      for (let i = 0; i < 20; i++) {
        cy.get('#messageInput').type(`Spam ${i}`);
        cy.get('#btnSend').click();
      }
      
      cy.get('.toast-error').should('contain', '发送过于频繁');
    });
  });

  describe('CSRF Protection', () => {
    it('should reject requests without valid token', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/messages`,
        body: { content: 'test' },
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });

    it('should validate token on state-changing requests', () => {
      cy.request({
        method: 'POST',
        url: `${API_URL}/contacts`,
        headers: { Authorization: 'Bearer invalid_token' },
        body: { contactId: 'test' },
        failOnStatusCode: false
      }).then((response) => {
        expect(response.status).to.eq(401);
      });
    });
  });

  describe('Encryption', () => {
    it('should use HTTPS for API calls', () => {
      cy.intercept('POST', `${API_URL}/**`).as('apiCall');
      
      cy.login('testuser', 'testpass123');
      cy.get('.conversation-item').first().click();
      cy.get('#messageInput').type('Test');
      cy.get('#btnSend').click();
      
      cy.wait('@apiCall').then((interception) => {
        expect(interception.request.url).to.match(/^https:/);
      });
    });

    it('should not expose sensitive data in URL', () => {
      cy.login('testuser', 'testpass123');
      
      cy.url().should('not.contain', 'token=');
      cy.url().should('not.contain', 'password=');
    });
  });

  describe('Content Security Policy', () => {
    it('should have CSP headers', () => {
      cy.request(BASE_URL).then((response) => {
        expect(response.headers).to.have.property('content-security-policy');
      });
    });

    it('should block inline scripts', () => {
      cy.visit(`${BASE_URL}/test-csp.html`);
      cy.get('#csp-test-result').should('contain', 'blocked');
    });
  });

  describe('Session Security', () => {
    it('should expire token after inactivity', () => {
      cy.login('testuser', 'testpass123');
      
      // Fast-forward time
      cy.clock().tick(25 * 60 * 60 * 1000); // 25 hours
      
      cy.reload();
      cy.url().should('include', 'login.html');
    });

    it('should prevent session fixation', () => {
      const oldToken = 'old_session_token';
      cy.window().then((win) => {
        win.sessionStorage.setItem('fk_token', oldToken);
      });
      
      cy.login('testuser', 'testpass123');
      
      cy.window().its('localStorage.fk_token').should('not.eq', oldToken);
    });
  });
});
