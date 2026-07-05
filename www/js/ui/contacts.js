/**
 * ContactsUI — contact list management
 * FIBEMATE v2.21-zk-ts
 *
 * Extracted from main.js: loadContacts, buildContactItem, addDemoContacts,
 * bindContactEvents, addContact.
 *
 * Usage:
 *   import { ContactsUI } from './js/ui/contacts.js';
 *   const cui = new ContactsUI({ onStartChat: (uid, name) => { ... }, onStartCall: (name) => { ... }, chatUI });
 */

export class ContactsUI {
  /**
   * @param {object} opts
   * @param {function} opts.onStartChat   — (userId, name) => void
   * @param {function} opts.onStartCall   — (name) => void
   * @param {object} opts.chatUI          — ChatUI instance (for toast/switch)
   */
  constructor(opts = {}) {
    this._onChat  = opts.onStartChat || (() => {});
    this._onCall  = opts.onStartCall || (() => {});
    this._chatUI  = opts.chatUI || null;
  }

  loadContacts() {
    const list = document.getElementById('contactList');
    const empty = document.getElementById('emptyContacts');
    const contacts = JSON.parse(localStorage.getItem('fibemate_contacts') || '[]');
    if (contacts.length === 0) {
      if (empty) empty.style.display = 'flex';
      this.addDemoContacts();
      return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = contacts.map(c => this.buildContactItem(c)).join('');
    this.bindContactEvents();
  }

  buildContactItem(c) {
    const online = c.online ? '<span class="online-dot"></span>' : '';
    return '<div class="contact-item" data-user-id="' + c.userId + '" data-name="' + c.name + '">' +
      '<div class="contact-avatar">' + (c.name || 'U').charAt(0).toUpperCase() + online + '</div>' +
      '<div class="contact-info"><div class="contact-name">' + c.name + '</div><div class="contact-username">@' + (c.username || c.userId) + '</div></div>' +
      '<div class="contact-actions">' +
        '<button class="icon-btn contact-chat" title="Message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
        '<button class="icon-btn contact-call" title="Call"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></button>' +
      '</div>' +
    '</div>';
  }

  addDemoContacts() {
    const demos = [
      { userId: 'demo1', name: 'Alice', username: 'alice', online: true },
      { userId: 'demo2', name: 'Bob', username: 'bob', online: false },
      { userId: 'demo3', name: 'Charlie', username: 'charlie', online: true },
    ];
    localStorage.setItem('fibemate_contacts', JSON.stringify(demos));
    const list = document.getElementById('contactList');
    const empty = document.getElementById('emptyContacts');
    if (empty) empty.style.display = 'none';
    list.innerHTML = demos.map(c => this.buildContactItem(c)).join('');
    this.bindContactEvents();
  }

  bindContactEvents() {
    const self = this;
    document.querySelectorAll('.contact-chat').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.contact-item');
        if (this._chatUI && this._chatUI.switchTab) this._chatUI.switchTab('messages');
        this._onChat(item.dataset.userId, item.dataset.name);
      });
    });
    document.querySelectorAll('.contact-call').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = e.target.closest('.contact-item');
        this._onCall(item.dataset.name);
      });
    });
  }

  async addContact() {
    const username = document.getElementById('contactUsername')?.value?.trim() || '';
    const displayName = document.getElementById('contactDisplayName')?.value?.trim() || '';
    if (!username) {
      if (this._chatUI) this._chatUI.showToast('Please enter a username', 'error');
      return;
    }

    const contacts = JSON.parse(localStorage.getItem('fibemate_contacts') || '[]');
    if (contacts.find(c => c.username === username || c.userId === username)) {
      if (this._chatUI) this._chatUI.showToast('Contact already exists', 'error');
      return;
    }

    const newContact = { userId: username, name: displayName || username, username, online: false };
    contacts.push(newContact);
    localStorage.setItem('fibemate_contacts', JSON.stringify(contacts));
    this.loadContacts();
    if (this._chatUI) this._chatUI.hideModal('modalAddContact');
    const uname = document.getElementById('contactUsername');
    const dname = document.getElementById('contactDisplayName');
    if (uname) uname.value = '';
    if (dname) dname.value = '';
    if (this._chatUI) this._chatUI.showToast('Added ' + newContact.name + ' to contacts', 'success');
  }
}