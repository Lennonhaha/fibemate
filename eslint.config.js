const js = require("@eslint/js");

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
      "no-console": "off"
    },
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "dist/**",
      "www/crypto/**/pkg/**",
      "**/*.wasm",
      "**/target/**",
      "**/build/**",
      "addon/**",
      "**/__pycache__/**"
    ]
  }
];
