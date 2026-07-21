// Update index.html references from lg-089 → lg-091
const fs = require('fs');
const path = '/opt/fibemate-repo/www/index.html';
let html = fs.readFileSync(path, 'utf8');

const patches = [
    [/ML-KEM-768 NTT 域 ✅ Noble ✓ 200\/200/g, 'ML-KEM-768 NTT 域 ✅ Noble ✓ 200/200 · liboqs ✓ 10,000/10,000'],
    [/TSR 89 份 \(lg-001~089\)/g, 'TSR 91 份 (lg-001~091)'],
    [/<strong>89 份<\/strong>/g, '<strong>91 份</strong>'],
    [/Noble ✓ 200\/200 \+ lg-001~lg-089/g, 'Noble ✓ 200/200 + liboqs ✓ 10,000/10,000 + lg-001~lg-091'],
    [/lg-001~089<\/span>/g, 'lg-001~091</span>'],
    [/lg-001~089/g, 'lg-001~091'],
    [/ML-KEM-768 NTT 域完全重写 · Noble 200\/200 交叉验证/g, 'ML-KEM-768 NTT 域完全重写 · Noble 200/200 + liboqs 10,000/10,000 双向交叉验证'],
];

let count = 0;
for (const [re, rep] of patches) {
    const newHtml = html.replace(re, rep);
    if (newHtml !== html) { count++; html = newHtml; }
}

fs.writeFileSync(path, html, 'utf8');
console.log(`Applied ${count} patches`);

// Verify
const v = fs.readFileSync(path, 'utf8');
const checks = [
    ['91 份', v.includes('91 份')],
    ['lg-001~091', v.includes('lg-001~091')],
    ['liboqs', v.includes('liboqs')],
    ['10,000', v.includes('10,000')],
];
for (const [label, ok] of checks) {
    console.log(`${ok ? '✅' : '❌'} ${label}`);
}
