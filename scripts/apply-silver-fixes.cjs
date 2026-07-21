// Update CI to add ESLint static analysis step
const fs = require('fs');
const path = '/opt/fibemate-repo/.github/workflows/ci.yml';
let ci = fs.readFileSync(path, 'utf8');

// Add lint job after node-test
const lintJob = `
  # ESLint 静态分析
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262

      - name: Setup Node.js \${{ env.NODE_VERSION }}
        uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020
        with:
          node-version: \${{ env.NODE_VERSION }}

      - name: Install ESLint
        run: npm install --no-save eslint

      - name: Run ESLint
        run: npx eslint packages/pqc-kem/src/ scripts/ test/ --max-warnings 50
`;

// Insert after docs-check job
const marker = "# Markdown / 文档检查";
const insertAt = ci.indexOf(marker);
ci = ci.slice(0, insertAt) + lintJob + '\n  ' + ci.slice(insertAt);

fs.writeFileSync(path, ci, 'utf8');
console.log('CI updated with ESLint job');

// Also update package.json to add lint script
const pkgPath = '/opt/fibemate-repo/package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts.lint = 'eslint packages/pqc-kem/src/ scripts/ test/';
pkg.scripts['lint:quiet'] = 'eslint packages/pqc-kem/src/ scripts/ test/ --max-warnings 50';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('package.json: lint script added');
