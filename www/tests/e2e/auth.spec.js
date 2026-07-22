// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE E2E Tests - Authentication Flow
 * Tests: Login, Registration, Logout, Token Persistence
 */

describe('Authentication', () => {
  const BASE_URL = 'http://localhost:3000';
  const API_URL = 'window.location.origin + '/api'';
  
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit(`${BASE_URL}/login.html`);
  });

  describe('Login Page', () => {
    it('should display login form', () => {
      cy.get('#loginForm').should('be.visible');
      cy.get('#loginUsername').should('exist');
      cy.get('#loginPassword').should('exist');
      cy.get('#btnLogin').should('be.visible');
    });

    it('should show error for empty credentials', () => {
      cy.get('#btnLogin').click();
      cy.get('.toast-error').should('contain', '用户名和密码不能为空');
    });

    it('should show error for invalid credentials', () => {
      cy.get('#loginUsername').type('invaliduser');
      cy.get('#loginPassword').type('wrongpassword');
      cy.get('#btnLogin').click();
      cy.get('.toast-error', { timeout: 10000 }).should('be.visible');
    });

    it('should login successfully with valid credentials', () => {
      cy.intercept('POST', `${API_URL}/auth/login`).as('loginRequest');
      
      cy.get('#loginUsername').type('testuser');
      cy.get('#loginPassword').type('testpass123');
      cy.get('#btnLogin').click();
      
      cy.wait('@loginRequest').its('response.statusCode').should('eq', 200);
      cy.url().should('include', 'main.html');
      cy.window().its('localStorage.fk_token').should('exist');
    });

    it('should persist session across page reloads', () => {
      // Login first
      cy.get('#loginUsername').type('testuser');
      cy.get('#loginPassword').type('testpass123');
      cy.get('#btnLogin').click();
      
      cy.url().should('include', 'main.html');
      
      // Reload and verify still logged in
      cy.reload();
      cy.get('#userName').should('be.visible');
      cy.window().its('localStorage.fk_token').should('exist');
    });

    it('should redirect to login when token is missing', () => {
      cy.visit(`${BASE_URL}/main.html`);
      cy.url().should('include', 'index.html');
    });
  });

  describe('Registration', () => {
    it('should switch to register tab', () => {
      cy.get('#tabRegister').click();
      cy.get('#registerForm').should('be.visible');
      cy.get('#regUsername').should('exist');
    });

    it('should validate password match', () => {
      cy.get('#tabRegister').click();
      cy.get('#regUsername').type('newuser');
      cy.get('#regPassword').type('pass123');
      cy.get('#regConfirmPassword').type('pass456');
      cy.get('#btnRegister').click();
      cy.get('.toast-error').should('contain', '密码不匹配');
    });

    it('should register new user', () => {
      cy.intercept('POST', `${API_URL}/auth/register`).as('registerRequest');
      
      cy.get('#tabRegister').click();
      cy.get('#regUsername').type(`testuser_${Date.now()}`);
      cy.get('#regPassword').type('SecurePass123!');
      cy.get('#regConfirmPassword').type('SecurePass123!');
      cy.get('#btnRegister').click();
      
      cy.wait('@registerRequest', { timeout: 15000 }).its('response.statusCode').should('eq', 201);
    });
  });

  describe('Logout', () => {
    it('should clear session on logout', () => {
      // Login first
      cy.get('#loginUsername').type('testuser');
      cy.get('#loginPassword').type('testpass123');
      cy.get('#btnLogin').click();
      
      cy.url().should('include', 'main.html');
      
      // Logout
      cy.get('#btnLogout').click();
      cy.get('.toast-success').should('contain', '已退出登录');
      
      cy.window().its('localStorage.fk_token').should('not.exist');
      cy.url().should('include', 'index.html');
    });
  });

  describe('ZK Login', () => {
    it('should display ZK login option', () => {
      cy.get('#btnZKLogin').should('be.visible');
    });

    it('should initiate ZK proof generation on click', () => {
      cy.get('#btnZKLogin').click();
      cy.get('#zkProofModal').should('be.visible');
      cy.get('#zkProofStatus').should('contain', '生成零知识证明');
    });
  });
});
