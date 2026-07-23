// Precise ePrint annotation: mark submission status, NOT paper content
const fs = require('fs');

// ─── README ───
let rm = fs.readFileSync('/opt/fibemate-repo/README.md', 'utf8');
const oldEp = '[ePrint](https://eprint.iacr.org/2026/110618)';
const newEp = '[ePrint](https://eprint.iacr.org/2026/110618) *(submission returned after editorial review)*';
if (rm.includes(oldEp) && !rm.includes(newEp)) {
  rm = rm.replace(oldEp, newEp);
  console.log('[README] ePrint annotation added');
}

// Also fix the PDF ref line if present
const oldPdf = 'Tianhe Liu. IACR Cryptology ePrint Archive, Report 2026/110618, 2026.';
const newPdf = 'Tianhe Liu. IACR Cryptology ePrint Archive, Report 2026/110618, 2026 *(submission returned after editorial review)*.';
if (rm.includes(oldPdf) && !rm.includes(newPdf)) {
  rm = rm.replace(oldPdf, newPdf);
  console.log('[README] BibTeX annotation added');
}

fs.writeFileSync('/opt/fibemate-repo/README.md', rm, 'utf8');

// ─── index.html (L1184 TSR line) — ePrint status, keep VWZ ✅ for project status ───
let html = fs.readFileSync('/opt/fibemate-repo/www/index.html', 'utf8');
// Don't touch VWZ 148/148 ✅ — that's project test status, not paper status
// But we should note ePrint submission status somewhere visible — add a small annotation
// near the challenge link to be precise without touching the test badge

// ─── Verify ───
rm = fs.readFileSync('/opt/fibemate-repo/README.md', 'utf8');
console.log('\n--- Validation ---');
console.log('README has annotation:', rm.includes('submission returned'));
console.log('README has VWZ Challenge:', rm.includes('VWZ Challenge'));
console.log('README NO "withdrawn":', !rm.includes('withdrawn'));

html = fs.readFileSync('/opt/fibemate-repo/www/index.html', 'utf8');
console.log('index.html VWZ check:', html.includes('VWZ 148/148 ✅'));
console.log('index.html challenge link:', html.includes('vwz-challenge'));
console.log('index.html NO "withdrawn":', !html.includes('withdrawn'));
