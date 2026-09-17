// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
const js = require("@eslint/js");
const noJsBigIntInHotPath = require("./eslint-rules/no-js-bigint-in-hotpath");

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        require: "readonly",
        module: "readonly",
        process: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        global: "readonly",
        crypto: "readonly",
        WebAssembly: "readonly",
        window: "readonly",
        fetch: "readonly",
        describe: "readonly",
        it: "readonly",
        path: "readonly",
        __filename: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-undef": "warn",
      "no-console": "off",
      "no-empty": "off",
      "no-irregular-whitespace": "off",
      "no-regex-spaces": "off",
      "custom/no-js-bigint-in-hotpath": "error"
    },
    plugins: {
      "custom": {
        rules: {
          "no-js-bigint-in-hotpath": noJsBigIntInHotPath
        }
      }
    }
  },

  // ===== src/ scope (added 2026-09-18) =====
  // 目的：把 src/ 纳入 CI lint，靠 no-use-before-define 兜住 TDZ 类运行时崩溃
  // （2026-09-18 生产事故根因：rateLimitMiddleware 先用后声明）。
  // 历史遗留噪声（no-unused-vars / no-undef）本 PR 定向豁免、另行跟踪；
  // 安全类自定义规则 custom/no-js-bigint-in-hotpath 保持开启（个案用行内豁免注释）。
  {
    files: ["src/**/*.js", "src/*.js"],
    rules: {
      "no-use-before-define": ["error", { "functions": false, "classes": false }],
      "no-unused-vars": "off",
      "no-undef": "off"
    }
  },
  {
    ignores: ["**/*.mjs", "scripts/tvla/**",
      "scripts/archive/**",
      "scripts/bench-diff.js", "scripts/daily-audit.js",
      "scripts/eiprint-annotation.cjs", "scripts/fix-vwz-website.cjs",
      "scripts/bench-v33.cjs", "scripts/benchmark.cjs", "scripts/quick-bench-sm2.cjs",
      "scripts/smoke-test.js", "scripts/test-sm2-node-fix.js",
      "scripts/verify-gradient-quick.cjs",
      "scripts/dismiss-via-gh.js", "scripts/setup-security-noise-filter.js",
      "packages/fml-dsa/**"]
  }
];
