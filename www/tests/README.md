# FIBEMATE Test Suite

## E2E Tests (Cypress)

### Setup
```bash
cd tests/e2e
npm install cypress --save-dev
npx cypress open
```

### Run Tests
```bash
# Run all tests headlessly
npx cypress run

# Run specific spec
npx cypress run --spec "cypress/e2e/auth.spec.js"

# Run with specific browser
npx cypress run --browser chrome
```

### Test Files
- `auth.spec.js` - Authentication (login, register, logout, ZK login)
- `messaging.spec.js` - Messaging (send/receive, E2EE, files, voice)
- `contacts.spec.js` - Contacts (add, export, search, groups)
- `security.spec.js` - Security (XSS, rate limiting, CSRF, encryption)

### Custom Commands
- `cy.login(username, password)` - Login with credentials
- `cy.zkLogin(username)` - Login with zero-knowledge proof
- `cy.sendMessage(content)` - Send a message
- `cy.openConversation(peerName)` - Open conversation
- `cy.mockWSMessage(message)` - Simulate WebSocket message
- `cy.checkEncrypted()` - Verify encryption indicator

## Security Tools

### Log Analyzer
```bash
# Analyze nginx access log
node security/log-analyzer.js /var/log/nginx/access.log report.json

# Output as text
node security/log-analyzer.js /var/log/nginx/access.log report.txt
```

### Real-time Monitor
```bash
# Start monitoring
node security/realtime-monitor.js /var/log/nginx/access.log

# Auto-block suspicious IPs
node security/realtime-monitor.js /var/log/nginx/access.log --auto-block

# With webhook alerts
ALERT_WEBHOOK=https://hooks.slack.com/xxx node security/realtime-monitor.js
```

### Features
- Brute force detection
- SQL injection detection
- XSS attempt detection
- Path traversal detection
- Scanner/bot detection
- Rate limit monitoring
- Automatic IP blocking
- Webhook alerts

## UI Bindings Utility

### Usage
```javascript
// Import
import { bindClicks, bindModals, bindTabs, MainUIBindings } from './ui-bindings.js';

// Bind all main UI elements
bindClicks(MainUIBindings);

// Bind modals
bindModals({
  btnAddContact: 'modalAddContact',
  btnCreateGroup: { modalId: 'modalCreateGroup', onShow: () => loadContacts() }
});

// Bind tabs
bindTabs('.nav-tabs', (tabId) => switchTab(tabId));
```

## Running Tests in CI

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cypress-io/github-action@v5
        with:
          start: npm start
          wait-on: 'http://localhost:3000'
```
