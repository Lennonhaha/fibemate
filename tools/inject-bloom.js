const { readFileSync, writeFileSync } = require('fs');

// Read the full data
const data = JSON.parse(readFileSync('tools/bloom-data.json', 'utf8'));

// Read the HTML
let html = readFileSync('www/docs/bloom-risk.html', 'utf8');

// Find the var BLOOM line
const bloomLine = html.indexOf('var BLOOM = {');
if (bloomLine < 0) {
    console.error('BLOOM not found in HTML');
    process.exit(1);
}

// Find the closing }; (next } after the line)
const blockStart = bloomLine;
// Find the matching closing brace
let depth = 0;
let blockEnd = -1;
for (let i = bloomLine + 'var BLOOM = '.length; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
        depth--;
        if (depth === 0) { blockEnd = i + 1; break; }
    }
}
if (blockEnd < 0) { console.error('Cannot find closing brace'); process.exit(1); }

// Find the semicolon after the closing brace
const semiPos = html.indexOf(';', blockEnd);
if (semiPos < 0) { console.error('Cannot find semicolon'); process.exit(1); }

const before = html.substring(0, bloomLine);
const after = html.substring(semiPos + 1);
const newBlock = 'var BLOOM = ' + JSON.stringify(data) + ';';

html = before + newBlock + after;
writeFileSync('www/docs/bloom-risk.html', html, 'utf8');
console.log('Replaced. New size:', html.length);

// Verify
const verifyHtml = readFileSync('www/docs/bloom-risk.html', 'utf8');
console.log('Contains directFiles:', verifyHtml.includes('directFiles'));
