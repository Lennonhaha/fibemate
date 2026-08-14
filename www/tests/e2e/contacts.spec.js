// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE E2E Tests - Contacts Management
 * Tests: Add Contact, Export, Search, Group Creation
 */

describe('Contacts', () => {
  const BASE_URL = 'http://localhost:3000';
  const API_URL = window.location.origin + '/api';
  
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit(`${BASE_URL}/login.html`);
    
    cy.get('#loginUsername').type('testuser');
    cy.get('#loginPassword').type('testpass123');
    cy.get('#btnLogin').click();
    
    cy.url().should('include', 'main.html', { timeout: 10000 });
  });

  describe('Contact List', () => {
    it('should display contacts tab', () => {
      cy.get('[data-tab="contacts"]').click();
      cy.get('#panelContacts').should('have.class', 'active');
      cy.get('#contactList').should('be.visible');
    });

    it('should load contacts from backend', () => {
      cy.intercept('GET', `${API_URL}/contacts`).as('getContacts');
      
      cy.get('[data-tab="contacts"]').click();
      cy.wait('@getContacts').its('response.statusCode').should('eq', 200);
    });

    it('should display contact information', () => {
      cy.get('[data-tab="contacts"]').click();
      cy.get('.contact-item').should('have.length.at.least', 1);
      cy.get('.contact-name').first().should('be.visible');
    });
  });

  describe('Add Contact', () => {
    it('should open add contact modal', () => {
      cy.get('#btnAddContact').click();
      cy.get('#modalAddContact').should('be.visible');
    });

    it('should validate contact ID', () => {
      cy.get('#btnAddContact').click();
      cy.get('#btnConfirmAddContact').click();
      
      cy.get('.toast-error').should('contain', '请输入联系人ID');
    });

    it('should add new contact', () => {
      cy.intercept('POST', `${API_URL}/contacts`).as('addContact');
      
      cy.get('#btnAddContact').click();
      cy.get('#contactIdInput').type('newcontact123');
      cy.get('#btnConfirmAddContact').click();
      
      cy.wait('@addContact').its('response.statusCode').should('eq', 201);
      cy.get('.toast-success').should('contain', '添加成功');
    });

    it('should handle duplicate contact', () => {
      cy.intercept('POST', `${API_URL}/contacts`, {
        statusCode: 409,
        body: { error: 'Contact already exists' }
      }).as('duplicateContact');
      
      cy.get('#btnAddContact').click();
      cy.get('#contactIdInput').type('existinguser');
      cy.get('#btnConfirmAddContact').click();
      
      cy.wait('@duplicateContact');
      cy.get('.toast-error').should('contain', '已存在');
    });
  });

  describe('Export Contacts', () => {
    it('should export contacts as JSON', () => {
      cy.intercept('GET', `${API_URL}/contacts`).as('getContacts');
      
      cy.get('#btnExportContacts').click();
      cy.wait('@getContacts');
      
      cy.readFile('cypress/downloads/fibemate-contacts-*.json').should('exist');
    });
  });

  describe('Contact Search', () => {
    it('should filter contacts by name', () => {
      cy.get('[data-tab="contacts"]').click();
      cy.get('#searchInput').type('Alice');
      
      cy.get('.contact-item').should('have.length', 1);
      cy.get('.contact-name').should('contain', 'Alice');
    });

    it('should show no results for unknown contact', () => {
      cy.get('[data-tab="contacts"]').click();
      cy.get('#searchInput').type('NonExistentUser12345');
      
      cy.get('.contact-item').should('have.length', 0);
      cy.get('.empty-state').should('be.visible');
    });
  });

  describe('Groups', () => {
    it('should open create group modal', () => {
      cy.get('#btnCreateGroup').click();
      cy.get('#modalCreateGroup').should('be.visible');
    });

    it('should create a new group', () => {
      cy.intercept('POST', `${API_URL}/groups`).as('createGroup');
      
      cy.get('#btnCreateGroup').click();
      cy.get('#groupNameInput').type('Test Group');
      cy.get('#groupMembersSelect').select(['user1', 'user2']);
      cy.get('#btnConfirmCreateGroup').click();
      
      cy.wait('@createGroup').its('response.statusCode').should('eq', 201);
      cy.get('.toast-success').should('contain', '群组创建成功');
    });

    it('should display group in conversation list', () => {
      cy.get('.conversation-item').should('contain', 'Test Group');
    });

    it('should send message to group', () => {
      cy.get('.conversation-item').contains('Test Group').click();
      cy.get('#messageInput').type('Group message');
      cy.get('#btnSend').click();
      
      cy.get('.message-bubble').should('contain', 'Group message');
    });
  });

  describe('Safety Numbers', () => {
    it('should display safety number for contact', () => {
      cy.get('[data-tab="contacts"]').click();
      cy.get('.contact-item').first().click();
      
      cy.get('#btnVerify').click();
      cy.get('#modalSafetyNumbers').should('be.visible');
      cy.get('.safety-number-display').should('be.visible');
    });

    it('should mark contact as verified', () => {
      cy.get('[data-tab="contacts"]').click();
      cy.get('.contact-item').first().click();
      
      cy.get('#btnVerify').click();
      cy.get('#btnMarkVerified').click();
      
      cy.get('.contact-verified-badge').should('be.visible');
    });
  });
});
