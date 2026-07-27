/**
 * ESLint 自定义规则: no-js-bigint-in-hotpath
 * 禁止纯 JS BigInt 路径进入生产加密热路径
 * 原理: JS BigInt 非恒定时间，不适合高吞吐加密操作
 */

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '禁止纯 JS BigInt 路径进入生产加密热路径',
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
        '纯 JS BigInt 路径 "{{name}}" 进入热路径 "{{hotPath}}" — 性能风险: {{ops}} ops/s，建议使用 C Addon 或 WASM 路径。',
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
    
    // 已知慢路径标记
    const slowPathMarkers = [
      'BigInt',
      'bigint',
      'jsOnly',
      'pureJs',
      'fallbackJs',
    ];
    
    return {
      // 检查函数声明/表达式中的慢路径调用
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'Identifier') return;
        
        const funcName = callee.name;
        
        // 检查是否在热路径函数内
        const scope = context.getScope();
        const functionName = getEnclosingFunctionName(scope);
        
        if (!functionName || !hotPaths.includes(functionName)) return;
        
        // 检查是否调用慢路径函数
        if (slowPathMarkers.some(marker => funcName.toLowerCase().includes(marker.toLowerCase()))) {
          context.report({
            node,
            messageId: 'noJsBigIntInHotPath',
            data: {
              name: funcName,
              hotPath: functionName,
              ops: '~100', // JS BigInt 典型 ops/s
            },
          });
        }
      },
      
      // 检查 import/require 的慢路径模块
      ImportDeclaration(node) {
        const source = node.source.value;
        if (source.includes('bigint') || source.includes('pure-js')) {
          context.report({
            node,
            messageId: 'noJsBigIntInHotPath',
            data: {
              name: source,
              hotPath: 'module import',
              ops: '~100',
            },
          });
        }
      },
    };
    
    function getEnclosingFunctionName(scope) {
      let current = scope;
      while (current) {
        if (current.block && current.block.type === 'FunctionDeclaration' && current.block.id) {
          return current.block.id.name;
        }
        if (current.block && current.block.type === 'FunctionExpression' && current.block.id) {
          return current.block.id.name;
        }
        if (current.block && current.block.type === 'ArrowFunctionExpression') {
          // 尝试从变量声明推断
          const parent = current.block.parent;
          if (parent && parent.type === 'VariableDeclarator' && parent.id) {
            return parent.id.name;
          }
        }
        current = current.upper;
      }
      return null;
    }
  },
};
