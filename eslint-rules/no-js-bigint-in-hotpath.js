// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
/**
 * ESLint 自定义规�? no-js-bigint-in-hotpath
 * 禁止�?JS BigInt 路径进入生产加密热路�? * 原理: JS BigInt 非恒定时间，不适合高吞吐加密操�? * 
 * 兼容 ESLint flat config (v8+ / v9+)
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止�?JS BigInt 路径进入生产加密热路�?,
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
            description: '热路径函数名列表',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noJsBigIntInHotPath: 
        '�?JS BigInt 路径 "{{name}}" 进入热路�?�?性能风险: {{ops}} ops/s，建议使�?C Addon �?WASM 路径�?,
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
    
    // 已知慢路径标�?    const slowPathMarkers = [
      'BigInt',
      'bigint',
      'jsOnly',
      'pureJs',
      'fallbackJs',
    ];
    
    // 跟踪当前是否在热路径函数�?    let functionStack = [];
    
    return {
      // 进入函数
      'FunctionDeclaration,FunctionExpression,ArrowFunctionExpression'(node) {
        let funcName = null;
        if (node.id) {
          funcName = node.id.name;
        } else if (node.parent && node.parent.type === 'VariableDeclarator' && node.parent.id) {
          funcName = node.parent.id.name;
        } else if (node.parent && node.parent.type === 'Property' && node.parent.key) {
          funcName = node.parent.key.name || node.parent.key.value;
        }
        
        functionStack.push({
          name: funcName,
          isHot: funcName && hotPaths.includes(funcName),
        });
      },
      
      // 退出函�?      'FunctionDeclaration,FunctionExpression,ArrowFunctionExpression:exit'() {
        functionStack.pop();
      },
      
      // 检查函数调�?      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'Identifier') return;
        
        const funcName = callee.name;
        
        // 检查是否在热路径函数内
        const currentFunc = functionStack[functionStack.length - 1];
        if (!currentFunc || !currentFunc.isHot) return;
        
        // 检查是否调用慢路径函数
        if (slowPathMarkers.some(marker => funcName.toLowerCase().includes(marker.toLowerCase()))) {
          context.report({
            node,
            messageId: 'noJsBigIntInHotPath',
            data: {
              name: funcName,
              ops: '~100', // JS BigInt 典型 ops/s
            },
          });
        }
      },
      
      // 检�?import/require 的慢路径模块
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
