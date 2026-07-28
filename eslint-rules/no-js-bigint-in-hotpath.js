// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * ESLint custom rule: no-js-bigint-in-hotpath
 *
 * Disallows JS BigInt-based crypto paths in production hot paths.
 * JS BigInt is not constant-time and unsuitable for high-throughput
 * cryptographic operations.
 *
 * Compatible with ESLint flat config (v8+ / v9+)
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow JS BigInt paths in production crypto hot paths',
      category: 'Security',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          hotPaths: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of hot path function names',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noJsBigIntInHotPath:
        'JS BigInt path "{{name}}" in hot path — performance risk: ' +
        '~{{ops}} ops/s. Use C Addon or WASM path instead.',
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const hotPaths = options.hotPaths || [
      'encrypt',
      'decrypt',
      'sign',
      'verify',
      'keygen',
      'encapsulate',
      'decapsulate',
      'deriveKey',
      'hybridKex',
    ];

    // Known slow-path markers
    const slowPathMarkers = [
      'BigInt',
      'bigint',
      'jsOnly',
      'pureJs',
      'fallbackJs',
    ];

    // Track whether we are inside a hot-path function
    /** @type {Array<{name: string|null, isHot: boolean}>} */
    let functionStack = [];

    return {
      // Enter a function
      'FunctionDeclaration,FunctionExpression,ArrowFunctionExpression'(node) {
        let funcName = null;
        if (node.id) {
          funcName = node.id.name;
        } else if (
          node.parent &&
          node.parent.type === 'VariableDeclarator' &&
          node.parent.id
        ) {
          funcName = node.parent.id.name;
        } else if (
          node.parent &&
          node.parent.type === 'Property' &&
          node.parent.key
        ) {
          funcName = node.parent.key.name || node.parent.key.value;
        }

        functionStack.push({
          name: funcName,
          isHot: funcName && hotPaths.includes(funcName),
        });
      },

      // Exit a function
      'FunctionDeclaration,FunctionExpression,ArrowFunctionExpression:exit'() {
        functionStack.pop();
      },

      // Check function calls
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'Identifier') return;

        const funcName = callee.name;

        // Check if we are inside a hot-path function
        const currentFunc = functionStack[functionStack.length - 1];
        if (!currentFunc || !currentFunc.isHot) return;

        // Check if calling a slow-path function
        if (
          slowPathMarkers.some((marker) =>
            funcName.toLowerCase().includes(marker.toLowerCase()),
          )
        ) {
          context.report({
            node,
            messageId: 'noJsBigIntInHotPath',
            data: {
              name: funcName,
              ops: '~100', // JS BigInt typical ops/s
            },
          });
        }
      },

      // Check imports of slow-path modules
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source.includes('bigint') || source.includes('pure-js')) {
          context.report({
            node,
            messageId: 'noJsBigIntInHotPath',
            data: {
              name: source,
              ops: '~100',
            },
          });
        }
      },

      // CommonJS require
      VariableDeclarator(node) {
        if (
          node.init &&
          node.init.type === 'CallExpression' &&
          node.init.callee.name === 'require' &&
          node.init.arguments.length > 0 &&
          node.init.arguments[0].type === 'Literal'
        ) {
          const source = node.init.arguments[0].value;
          if (source.includes('bigint') || source.includes('pure-js')) {
            context.report({
              node,
              messageId: 'noJsBigIntInHotPath',
              data: {
                name: source,
                ops: '~100',
              },
            });
          }
        }
      },
    };
  },
};
