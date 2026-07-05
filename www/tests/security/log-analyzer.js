/**
 * FIBEMATE Security Log Analyzer
 * Analyzes nginx and application logs for attack patterns
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

class SecurityLogAnalyzer {
  constructor(options = {}) {
    this.patterns = {
      // Brute force: multiple failed login attempts
      bruteForce: {
        pattern: /POST \/api\/auth\/(login|register)/i,
        threshold: 5,        // attempts
        windowMs: 60000,     // 1 minute
        statusCodes: [401, 403, 429]
      },
      
      // SQL Injection attempts
      sqlInjection: {
        pattern: /(\b(union|select|insert|update|delete|drop|create|alter)\b.*\b(from|into|table|database)\b)|(--|\/\*|\*\/|;)/i,
        severity: 'critical'
      },
      
      // XSS attempts
      xss: {
        pattern: /(<script|javascript:|on\w+\s*=|alert\s*\(|document\.cookie)/i,
        severity: 'high'
      },
      
      // Path traversal
      pathTraversal: {
        pattern: /(\.\.\/|\.\.\\|%2e%2e%2f|%252e%252e%252f)/i,
        severity: 'high'
      },
      
      // Scanner signatures
      scanner: {
        pattern: /(nmap|nikto|sqlmap|masscan|zgrab|gobuster|dirbuster|wfuzz|burp|nessus|openvas|acunetix)/i,
        severity: 'medium'
      },
      
      // Bad bots
      badBot: {
        pattern: /(curl|wget|python-requests|libwww-perl|scrapy|httpclient|java|axios|postman)/i,
        severity: 'low'
      },
      
      // Rate limit hits
      rateLimit: {
        pattern: /429|Too Many Requests/i,
        severity: 'info'
      },
      
      // Suspicious file access
      suspiciousFile: {
        pattern: /(\.env|\.git|\.svn|\.htaccess|config\.(xml|json)|phpmyadmin|wp-admin|xmlrpc\.php|shell\.php)/i,
        severity: 'medium'
      }
    };
    
    this.results = {
      summary: {
        totalLines: 0,
        threatsDetected: 0,
        uniqueIPs: new Set(),
        timeRange: { start: null, end: null }
      },
      threats: [],
      topAttackers: new Map(),
      hourlyDistribution: new Map()
    };
    
    this.options = {
      outputFormat: options.outputFormat || 'json',
      minSeverity: options.minSeverity || 'low',
      maxResults: options.maxResults || 1000
    };
  }

  /**
   * Analyze log file
   */
  async analyze(filePath) {
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      this.results.summary.totalLines++;
      this.processLine(line);
    }

    return this.generateReport();
  }

  /**
   * Process single log line
   */
  processLine(line) {
    // Extract common fields (nginx combined log format)
    const logMatch = line.match(/^(\S+)\s+-\s+(\S+)\s+\[(.*?)\]\s+"(.*?)"\s+(\d{3})\s+(\d+)\s+"(.*?)"\s+"(.*?)"/);
    
    if (!logMatch) return;
    
    const [_, ip, user, timestamp, request, status, size, referrer, userAgent] = logMatch;
    
    // Update time range
    const time = this.parseTime(timestamp);
    if (time) {
      if (!this.results.summary.timeRange.start || time < this.results.summary.timeRange.start) {
        this.results.summary.timeRange.start = time;
      }
      if (!this.results.summary.timeRange.end || time > this.results.summary.timeRange.end) {
        this.results.summary.timeRange.end = time;
      }
      
      // Hourly distribution
      const hour = time.getHours();
      this.results.hourlyDistribution.set(hour, (this.results.hourlyDistribution.get(hour) || 0) + 1);
    }
    
    this.results.summary.uniqueIPs.add(ip);
    
    // Check each pattern
    for (const [type, config] of Object.entries(this.patterns)) {
      if (config.pattern.test(line)) {
        this.recordThreat({
          type,
          severity: config.severity,
          ip,
          timestamp: time,
          request,
          status: parseInt(status),
          userAgent,
          raw: line
        });
        
        // Track top attackers
        this.results.topAttackers.set(ip, (this.results.topAttackers.get(ip) || 0) + 1);
      }
    }
  }

  /**
   * Record a threat
   */
  recordThreat(threat) {
    const severityLevels = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    
    if (severityLevels[threat.severity] >= severityLevels[this.options.minSeverity]) {
      this.results.threats.push(threat);
      this.results.summary.threatsDetected++;
    }
  }

  /**
   * Parse nginx log timestamp
   */
  parseTime(timestamp) {
    // Format: 15/May/2026:14:30:00 +0800
    const match = timestamp.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    
    const months = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    
    return new Date(
      parseInt(match[3]),
      months[match[2]],
      parseInt(match[1]),
      parseInt(match[4]),
      parseInt(match[5]),
      parseInt(match[6])
    );
  }

  /**
   * Generate analysis report
   */
  generateReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        ...this.results.summary,
        uniqueIPs: this.results.summary.uniqueIPs.size,
        timeRange: {
          start: this.results.summary.timeRange.start?.toISOString(),
          end: this.results.summary.timeRange.end?.toISOString()
        }
      },
      statistics: {
        topAttackers: Array.from(this.results.topAttackers.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20),
        hourlyDistribution: Array.from(this.results.hourlyDistribution.entries())
          .sort((a, b) => a[0] - b[0]),
        threatsByType: this.categorizeThreats(),
        threatsBySeverity: this.categorizeBySeverity()
      },
      threats: this.results.threats.slice(0, this.options.maxResults)
    };

    if (this.options.outputFormat === 'json') {
      return JSON.stringify(report, null, 2);
    }
    
    return this.formatTextReport(report);
  }

  /**
   * Categorize threats by type
   */
  categorizeThreats() {
    const categories = {};
    for (const threat of this.results.threats) {
      categories[threat.type] = (categories[threat.type] || 0) + 1;
    }
    return categories;
  }

  /**
   * Categorize by severity
   */
  categorizeBySeverity() {
    const severities = {};
    for (const threat of this.results.threats) {
      severities[threat.severity] = (severities[threat.severity] || 0) + 1;
    }
    return severities;
  }

  /**
   * Format as text report
   */
  formatTextReport(report) {
    const lines = [
      '╔══════════════════════════════════════════════════════════════╗',
      '║           FIBEMATE SECURITY LOG ANALYSIS REPORT              ║',
      '╚══════════════════════════════════════════════════════════════╝',
      '',
      `Generated: ${report.generatedAt}`,
      `Time Range: ${report.summary.timeRange.start} to ${report.summary.timeRange.end}`,
      '',
      '─ Summary ─',
      `  Total Lines Analyzed: ${report.summary.totalLines.toLocaleString()}`,
      `  Threats Detected: ${report.summary.threatsDetected.toLocaleString()}`,
      `  Unique IPs: ${report.summary.uniqueIPs.toLocaleString()}`,
      '',
      '─ Threats by Severity ─',
      ...Object.entries(report.statistics.threatsBySeverity).map(([s, c]) => `  ${s.toUpperCase()}: ${c}`),
      '',
      '─ Threats by Type ─',
      ...Object.entries(report.statistics.threatsByType).map(([t, c]) => `  ${t}: ${c}`),
      '',
      '─ Top Attackers ─',
      ...report.statistics.topAttackers.slice(0, 10).map(([ip, count], i) => 
        `  ${i + 1}. ${ip}: ${count} requests`
      ),
      '',
      '─ Hourly Distribution ─',
      ...report.statistics.hourlyDistribution.map(([h, c]) => 
        `  ${h.toString().padStart(2, '0')}:00: ${c} events`
      )
    ];
    
    return lines.join('\n');
  }
}

// CLI usage
if (require.main === module) {
  const logFile = process.argv[2] || '/var/log/nginx/access.log';
  const outputFile = process.argv[3] || 'security-report.json';
  
  const analyzer = new SecurityLogAnalyzer({
    outputFormat: outputFile.endsWith('.json') ? 'json' : 'text',
    minSeverity: 'low'
  });
  
  analyzer.analyze(logFile).then(report => {
    fs.writeFileSync(outputFile, report);
    console.log(`Report saved to ${outputFile}`);
  }).catch(err => {
    console.error('Analysis failed:', err.message);
    process.exit(1);
  });
}

module.exports = SecurityLogAnalyzer;
