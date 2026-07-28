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
        global: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
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
  {
    ignores: ["**/*.mjs"]
  }
];
