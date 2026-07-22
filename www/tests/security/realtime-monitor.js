// SPDX-License-Identifier: GPL-3.0-only
/**
 * FIBEMATE Real-time Security Monitor
 * Monitors logs in real-time and alerts on suspicious activity
 */

const fs = require('fs');
const { Tail } = require('tail');
const EventEmitter = require('events');

class SecurityMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.thresholds = {
      bruteForce: { attempts: 5, windowMs: 60000 },
      rateLimit: { requests: 100, windowMs: 60000 },
      scanner: { paths: 10, windowMs: 60000 }
    };
    
    this.tracking = new Map(); // IP -> { events: [], lastSeen }
    this.blockedIPs = new Set();
    this.suspiciousIPs = new Map();
    
    this.options = {
      logFile: options.logFile || '/var/log/nginx/access.log',
      alertWebhook: options.alertWebhook || null,
      autoBlock: options.autoBlock || false,
      blockThreshold: options.blockThreshold || 10
    };
  }

  /**
   * Start monitoring
   */
  start() {
    console.log(`[Monitor] Starting real-time monitoring of ${this.options.logFile}`);
    
    const tail = new Tail(this.options.logFile);
    
    tail.on('line', (line) => {
      this.processLine(line);
    });
    
    tail.on('error', (err) => {
      console.error('[Monitor] Tail error:', err);
      this.emit('error', err);
    });
    
    // Periodic cleanup of old tracking data
    setInterval(() => this.cleanup(), 60000);
    
    this.emit('started');
  }

  /**
   * Process a log line
   */
  processLine(line) {
    const parsed = this.parseLogLine(line);
    if (!parsed) return;
    
    const { ip, timestamp, request, status, userAgent } = parsed;
    
    // Update tracking
    if (!this.tracking.has(ip)) {
      this.tracking.set(ip, { events: [], firstSeen: timestamp });
    }
    
    const ipData = this.tracking.get(ip);
    ipData.events.push({ timestamp, request, status, userAgent });
    ipData.lastSeen = timestamp;
    
    // Check for threats
    this.checkBruteForce(ip, ipData);
    this.checkRateLimit(ip, ipData);
    this.checkScanner(ip, ipData, request);
    this.checkBadUserAgent(ip, userAgent);
    this.checkSuspiciousPath(ip, request);
  }

  /**
   * Parse nginx log line
   */
  parseLogLine(line) {
    const match = line.match(/^(\S+)\s+-\s+(\S+)\s+\[(.*?)\]\s+"(.*?)"\s+(\d{3})\s+(\d+)\s+"(.*?)"\s+"(.*?)"/);
    if (!match) return null;
    
    return {
      ip: match[1],
      user: match[2],
      timestamp: new Date(),
      request: match[4],
      status: parseInt(match[5]),
      size: parseInt(match[6]),
      referrer: match[7],
      userAgent: match[8]
    };
  }

  /**
   * Check for brute force attacks
   */
  checkBruteForce(ip, ipData) {
    const recent = ipData.events.filter(e => 
      Date.now() - e.timestamp.getTime() < this.thresholds.bruteForce.windowMs
    );
    
    const failedLogins = recent.filter(e => 
      e.request.includes('/api/auth/') && [401, 403, 429].includes(e.status)
    );
    
    if (failedLogins.length >= this.thresholds.bruteForce.attempts) {
      this.alert({
        type: 'brute_force',
        severity: 'high',
        ip,
        count: failedLogins.length,
        timeWindow: `${this.thresholds.bruteForce.windowMs / 1000}s`,
        message: `Brute force attack detected from ${ip}: ${failedLogins.length} failed login attempts`
      });
      
      if (this.options.autoBlock && failedLogins.length >= this.options.blockThreshold) {
        this.blockIP(ip);
      }
    }
  }

  /**
   * Check for rate limiting violations
   */
  checkRateLimit(ip, ipData) {
    const recent = ipData.events.filter(e => 
      Date.now() - e.timestamp.getTime() < this.thresholds.rateLimit.windowMs
    );
    
    if (recent.length >= this.thresholds.rateLimit.requests) {
      this.alert({
        type: 'rate_limit',
        severity: 'medium',
        ip,
        count: recent.length,
        message: `Rate limit exceeded by ${ip}: ${recent.length} requests in ${this.thresholds.rateLimit.windowMs / 1000}s`
      });
    }
  }

  /**
   * Check for scanner behavior
   */
  checkScanner(ip, ipData, request) {
    const scannerPaths = ['.env', '.git', 'phpmyadmin', 'wp-admin', 'xmlrpc.php', 'config'];
    const isScannerPath = scannerPaths.some(p => request.includes(p));
    
    if (isScannerPath) {
      const recentScans = ipData.events.filter(e => {
        const isScan = scannerPaths.some(p => e.request.includes(p));
        return isScan && Date.now() - e.timestamp.getTime() < this.thresholds.scanner.windowMs;
      });
      
      if (recentScans.length >= this.thresholds.scanner.paths) {
        this.alert({
          type: 'scanner',
          severity: 'medium',
          ip,
          count: recentScans.length,
          message: `Scanner detected from ${ip}: ${recentScans.length} suspicious path requests`
        });
      }
    }
  }

  /**
   * Check for bad user agents
   */
  checkBadUserAgent(ip, userAgent) {
    const badUAs = /(curl|wget|python-requests|libwww-perl|scrapy|httpclient|java|nikto|sqlmap|nmap|masscan|zgrab)/i;
    
    if (badUAs.test(userAgent)) {
      this.alert({
        type: 'bad_user_agent',
        severity: 'low',
        ip,
        userAgent,
        message: `Suspicious User-Agent from ${ip}: ${userAgent}`
      });
    }
  }

  /**
   * Check for suspicious paths
   */
  checkSuspiciousPath(ip, request) {
    const suspicious = /(union.*select|insert.*into|delete.*from|script|javascript:|on\w+\s*=)/i;
    
    if (suspicious.test(request)) {
      this.alert({
        type: 'suspicious_request',
        severity: 'high',
        ip,
        request,
        message: `Suspicious request pattern from ${ip}: ${request}`
      });
    }
  }

  /**
   * Send alert
   */
  alert(alertData) {
    const alertKey = `${alertData.ip}-${alertData.type}`;
    
    // Deduplicate alerts (1 minute cooldown)
    if (this.suspiciousIPs.has(alertKey)) {
      const lastAlert = this.suspiciousIPs.get(alertKey);
      if (Date.now() - lastAlert < 60000) return;
    }
    
    this.suspiciousIPs.set(alertKey, Date.now());
    
    console.log(`[ALERT] ${alertData.severity.toUpperCase()}: ${alertData.message}`);
    
    this.emit('alert', alertData);
    
    // Send webhook if configured
    if (this.options.alertWebhook) {
      this.sendWebhook(alertData);
    }
  }

  /**
   * Block IP (requires iptables or nginx deny)
   */
  blockIP(ip) {
    if (this.blockedIPs.has(ip)) return;
    
    this.blockedIPs.add(ip);
    console.log(`[Block] IP ${ip} has been blocked`);
    
    // Add to nginx deny list
    const denyLine = `deny ${ip};\n`;
    fs.appendFileSync('/etc/nginx/conf.d/blocklist.conf', denyLine);
    
    // Reload nginx
    const { exec } = require('child_process');
    exec('nginx -s reload', (err) => {
      if (err) console.error('[Block] Failed to reload nginx:', err);
    });
    
    this.emit('blocked', { ip, reason: 'Automatic block due to suspicious activity' });
  }

  /**
   * Send webhook notification
   */
  sendWebhook(alertData) {
    const https = require('https');
    const url = new URL(this.options.alertWebhook);
    
    const data = JSON.stringify({
      ...alertData,
      timestamp: new Date().toISOString(),
      source: 'fibemate-security-monitor'
    });
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`[Webhook] Failed: ${res.statusCode}`);
      }
    });
    
    req.on('error', (err) => {
      console.error('[Webhook] Error:', err.message);
    });
    
    req.write(data);
    req.end();
  }

  /**
   * Cleanup old tracking data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [ip, data] of this.tracking.entries()) {
      if (now - data.lastSeen.getTime() > maxAge) {
        this.tracking.delete(ip);
      } else {
        // Remove old events
        data.events = data.events.filter(e => 
          now - e.timestamp.getTime() < maxAge
        );
      }
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      monitoredIPs: this.tracking.size,
      blockedIPs: this.blockedIPs.size,
      activeAlerts: this.suspiciousIPs.size,
      topIPs: Array.from(this.tracking.entries())
        .sort((a, b) => b[1].events.length - a[1].events.length)
        .slice(0, 10)
        .map(([ip, data]) => ({
          ip,
          requests: data.events.length,
          firstSeen: data.firstSeen,
          lastSeen: data.lastSeen
        }))
    };
  }
}

// CLI usage
if (require.main === module) {
  const monitor = new SecurityMonitor({
    logFile: process.argv[2] || '/var/log/nginx/access.log',
    autoBlock: process.argv.includes('--auto-block'),
    alertWebhook: process.env.ALERT_WEBHOOK
  });
  
  monitor.on('alert', (alert) => {
    console.log('\n' + '='.repeat(60));
    console.log(`ALERT: ${alert.type.toUpperCase()}`);
    console.log(`Severity: ${alert.severity}`);
    console.log(`IP: ${alert.ip}`);
    console.log(`Message: ${alert.message}`);
    console.log('='.repeat(60) + '\n');
  });
  
  monitor.on('blocked', ({ ip, reason }) => {
    console.log(`[BLOCKED] ${ip} - ${reason}`);
  });
  
  monitor.start();
  
  // Stats every 5 minutes
  setInterval(() => {
    console.log('[Stats]', JSON.stringify(monitor.getStats(), null, 2));
  }, 300000);
}

module.exports = SecurityMonitor;
