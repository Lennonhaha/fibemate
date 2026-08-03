const fs = require('fs');
const path = require('path');

/**
 * FIBEMATE《密码法》合规自评工具 — 数据生成器
 * 
 * 法律依据：《中华人民共和国密码法》(2020年1月1日施行)
 * 全文 5 章 44 条，此处分析 12 条对开源 PQC 项目有约束力的核心条文
 */

// ═══════════════════════════════════════════
// 12 条核心条文 → FIBEMATE 证据映射
// ═══════════════════════════════════════════
const CLAUSES = [
  {
    id: 'c1',
    chapter: '第一章 总则',
    article: '第2条',
    title: '密码分类定义',
    fullText: '本法所称密码，是指采用特定变换的方法对信息等进行加密保护、安全认证的技术、产品和服务。',
    requirement: '项目需明确定位自身涉及的密码类型：核心密码、普通密码或商用密码。',
    category: 'classification',
    riskLevel: 'low',
    score: 100,
    evidence: [
      {
        file: 'packages/algorithm-registry/index.js',
        finding: '12 种算法按 PQC/classic/protocol/primitive/verification 五类归档，每类标注 FIPS/NIST/GB 标准归属',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html §2',
        finding: '明确声明"非生产加密产品，定位为 PQC 教育/验证平台"',
        status: 'compliant'
      }
    ]
  },
  {
    id: 'c2',
    chapter: '第一章 总则',
    article: '第5条',
    title: '国家鼓励商用密码技术的研究与应用',
    fullText: '国家鼓励商用密码技术的研究、开发、推广和应用，鼓励商用密码从业单位参与商用密码国际标准化活动。',
    requirement: '项目是否参与了国际标准化活动？是否有研究开发记录？',
    category: 'policy',
    riskLevel: 'safe',
    score: 100,
    evidence: [
      {
        file: 'www/docs/pqc-readiness.html §3',
        finding: 'ML-KEM-768 IANA 编号 #4588 (X25519MLKEM768) 已登记；SM2-MLKEM-768 混合方案 IANA #4590',
        status: 'compliant'
      },
      {
        file: 'CITATION.cff',
        finding: '引用 NIST FIPS 203/204/205 标准；12 种算法均标注标准来源',
        status: 'compliant'
      },
      {
        file: 'packages/fml-dsa/',
        finding: 'FIPS 204 ML-DSA 自研 JS 实现，交叉验证 Noble 库，学术研究属性确认',
        status: 'compliant'
      }
    ]
  },
  {
    id: 'c3',
    chapter: '第二章 核心密码与普通密码',
    article: '第7-12条',
    title: '核心密码/普通密码管理（不适用）',
    fullText: '核心密码、普通密码用于保护国家秘密信息。核心密码保护绝密级，普通密码保护机密级和秘密级。',
    requirement: 'FIBEMATE 不处理国家秘密 → 核心/普通密码条例不适用。明确标注"不适用"边界。',
    category: 'boundary',
    riskLevel: 'safe',
    score: 100,
    evidence: [
      {
        file: 'README.md & README.en.md',
        finding: '项目定位为"PQC 可执行教科书"，无国家秘密处理能力',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html',
        finding: '明确声明"非生产加密产品"，不适用于核心/普通密码管理',
        status: 'compliant'
      }
    ]
  },
  {
    id: 'c4',
    chapter: '第三章 商用密码',
    article: '第21条',
    title: '商用密码标准符合性',
    fullText: '商用密码的科研、生产、销售、服务和进出口，应当符合商用密码相关标准（GB/T 32918 SM2、GB/T 32905 SM3、GB/T 32907 SM4、GM/T 等）。',
    requirement: '项目中使用的国密算法实现（SM2/SM3/SM4）是否符合相关国标？',
    category: 'commercial',
    riskLevel: 'warning',
    score: 70,
    evidence: [
      {
        file: 'packages/sm2-ref/',
        finding: 'SM2 参考实现；通过 100/100 KAT 验证；SM2 TVLA 15/18 (3 documented: jsbn/BigInt)；非生产级',
        status: 'partial'
      },
      {
        file: 'packages/sm3-ref/',
        finding: 'SM3 参考实现；30/30 KAT 测试通过；纯 JS，非硬件加速',
        status: 'compliant'
      },
      {
        file: 'packages/sm4-ref/',
        finding: 'SM4-GCM 参考实现；30/30 KAT 测试通过；纯 JS GCM 模式',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html §4',
        finding: 'SM2 性能调优 v1.3：wNAF(w=4)+Comb G 表，sign≥3×/verify≥2×',
        status: 'partial',
        gap: '国家密码管理局商用密码产品检测证书：未申请。项目定位教育/验证平台不要求认证，但若未来商用化需申请'
      }
    ]
  },
  {
    id: 'c5',
    chapter: '第三章 商用密码',
    article: '第23条',
    title: '商用密码产品检测认证',
    fullText: '商用密码产品应当经依法授权的商用密码产品检测机构检测合格，取得商用密码产品认证证书。',
    requirement: 'FIBEMATE 作为开源教育项目而非商用密码产品，是否需要认证？',
    category: 'commercial',
    riskLevel: 'warning',
    score: 80,
    evidence: [
      {
        file: 'docs/research/',
        finding: 'FIBEMATE 定位为"PQC 可执行教科书"+"全栈工程验证平台"，未进行商业化销售',
        status: 'compliant'
      },
      {
        file: 'README.md',
        finding: '许可证 GPL-3.0-only；声明非生产产品；无商业销售行为',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html',
        finding: '明确声明"非生产加密产品"，不主张商用密码产品认证',
        status: 'compliant'
      }
    ],
    note: '开源教育/研究项目不强制要求商用密码产品认证。但若项目中任何模块被第三方用于商用场景，该第三方需自行申请认证。建议在 LICENSE 和 README 中增加免责声明。'
  },
  {
    id: 'c6',
    chapter: '第三章 商用密码',
    article: '第24条',
    title: '商用密码服务认证',
    fullText: '商用密码服务应当经依法授权的商用密码认证机构认证合格。',
    requirement: 'FIBEMATE 的 reg-server（WebSocket 密钥协商服务）是否需要密码服务认证？',
    category: 'commercial',
    riskLevel: 'warning',
    score: 85,
    evidence: [
      {
        file: 'packages/double-ratchet-pq.js',
        finding: 'reg-server 用于端到端加密测试和教育演示；不提供公开商用密码服务',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html §5',
        finding: '路径C-2 E2E 混合 KEX 10/10 测试通过；非生产服务',
        status: 'compliant'
      }
    ],
    note: '若未来 reg-server 对外提供密钥管理服务（如作为 SaaS），则需要商用密码服务认证。当前仅作教育演示用途不强制要求。'
  },
  {
    id: 'c7',
    chapter: '第三章 商用密码',
    article: '第25条',
    title: '关键信息基础设施（CII）密码应用安全',
    fullText: '关键信息基础设施的运营者应当依照法律、法规和标准的强制性要求使用商用密码进行保护，自行或者委托商用密码检测机构开展商用密码应用安全性评估。',
    requirement: 'FIBEMATE 是否部署于关键信息基础设施（CII）？包含 TLS/加密保护吗？',
    category: 'boundary',
    riskLevel: 'safe',
    score: 95,
    evidence: [
      {
        file: 'nginx conf & certbot.timer',
        finding: '全站 HTTPS (Let\'s Encrypt TLS 1.3) · certbot 每 12h 自动续期 · 3 域名 3 证书',
        status: 'compliant'
      },
      {
        file: 'www/docs/nist-csf-gap.html',
        finding: 'NIST CSF 差距分析覆盖数据传输加密、密钥管理、访问控制',
        status: 'compliant'
      },
      {
        file: '.env.example & src/lib/jwt-helper.js',
        finding: '敏感配置（JWT_SECRET 等）环境变量管理，不硬编码',
        status: 'compliant'
      }
    ],
    note: 'FIBEMATE 部署于阿里云 ECS（公有云），非 CII 运营者。若未来部署到 CII 环境，需委托第三方进行密评。'
  },
  {
    id: 'c8',
    chapter: '第三章 商用密码',
    article: '第26条',
    title: '商用密码进出口管制',
    fullText: '商用密码的进出口应当依法办理许可或者登记。涉及国家安全、社会公共利益且具有加密保护功能的商用密码，列入商用密码出口管制清单。',
    requirement: 'FIBEMATE 开源代码是否受出口管制？ML-KEM-768 是否受 Wassenaar 安排限制？',
    category: 'commercial',
    riskLevel: 'warning',
    score: 85,
    evidence: [
      {
        file: 'README.md & LICENSE',
        finding: 'MIT/WTFPL/GPL-3.0 开源授权；代码公开于 GitHub.com',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html',
        finding: 'PQC 算法（ML-KEM/SLH-DSA/ML-DSA）源自 NIST 公开标准，非受控技术',
        status: 'compliant'
      },
      {
        file: 'packages/pqc-kem/src/ml-kem-768.js',
        finding: 'ML-KEM-768 为纯 JS 实现（非加密硬件/HSM）；密钥强度 128-bit classical（Wassenaar de minimis 例外）',
        status: 'compliant'
      }
    ],
    note: '开源代码不受中国商用密码出口管制；但基于 FIBEMATE 的定制化系统集成或 ASIC 芯片设计可能触发管制。建议 README 增加 NOTICE: EXPORT CONTROL 章节。'
  },
  {
    id: 'c9',
    chapter: '第三章 商用密码',
    article: '第27条',
    title: '密码安全评估与检测',
    fullText: '商用密码从业单位应当建立健全安全管理制度，对商用密码的安全性、合规性定期进行评估。',
    category: 'governance',
    riskLevel: 'warning',
    score: 90,
    evidence: [
      {
        file: 'docs/GOVERNANCE.md (10.2KB)',
        finding: '完整的项目管理结构、决策流程、角色定义',
        status: 'compliant'
      },
      {
        file: '.github/workflows/ci.yml (24 jobs)',
        finding: 'CI 24/24 全绿；KAT 测试覆盖 SM2/SM3/SM4/ML-KEM 100/100',
        status: 'compliant'
      },
      {
        file: 'scripts/check-bom.cjs',
        finding: 'UTF-8 BOM 检查器；CI 中自动运行' ,
        status: 'compliant'
      },
      {
        file: '.github/workflows/codeql.yml',
        finding: 'CodeQL 安全扫描：JS/Python/Actions 自动检测',
        status: 'compliant'
      }
    ]
  },
  {
    id: 'c10',
    chapter: '第三章 商用密码',
    article: '第28条',
    title: '密码安全事件应急预案',
    fullText: '商用密码从业单位应当制定密码安全事件应急预案，定期组织演练。',
    category: 'governance',
    riskLevel: 'warning',
    score: 85,
    evidence: [
      {
        file: 'docs/INCIDENT_RESPONSE_PLAN.md (16.8KB)',
        finding: '完整的安全事件响应计划：分级/响应流程/通信模板/事后复盘',
        status: 'compliant'
      },
      {
        file: 'docs/RECOVERY_PLAN.md (18.6KB)',
        finding: '灾难恢复计划：RTO/RPO 定义 · 备份策略 · 恢复流程',
        status: 'compliant'
      },
      {
        file: 'MAINTAINERS.md',
        finding: '安全漏洞报告渠道 security@fibemate.net · 响应 SLA 72h',
        status: 'compliant'
      }
    ],
    gap: '演练记录：尚无实际演练记录。建议首次演练定在 2026 Q4。'
  },
  {
    id: 'c11',
    chapter: '第四章 法律责任',
    article: '第32-41条',
    title: '法律责任边界',
    fullText: '违反密码法规定的，由密码管理部门责令改正、给予警告、没收违法所得、罚款直至吊销相关资质。',
    requirement: 'FIBEMATE 需明确标注"非生产密码产品"，第三方使用需自行承担合规责任。',
    category: 'governance',
    riskLevel: 'safe',
    score: 90,
    evidence: [
      {
        file: 'README.md & LICENSE',
        finding: 'GPL-3.0-only "NO WARRANTY" 免责声明；明确标注非生产级',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html',
        finding: '多处标注"非生产加密产品" / "教育平台" / "不提供密码服务"',
        status: 'compliant'
      }
    ],
    gap: '建议增加 DISCLAIMER.md 专门声明中国密码法合规边界，明确第三方使用责任。'
  },
  {
    id: 'c12',
    chapter: '第五章 附则',
    article: '第42-44条',
    title: 'SM系列国密算法与PQC的衔接',
    fullText: '附则规定商用密码标准体系，为SM2/SM3/SM4等算法提供法律基础。',
    requirement: 'FIBEMATE 的 SM2/SM3/SM4 实现是否符合国密标准体系？PQC 与国密如何衔接？',
    category: 'commercial',
    riskLevel: 'safe',
    score: 80,
    evidence: [
      {
        file: 'packages/sm2-ref/ + packages/sm3-ref/ + packages/sm4-ref/',
        finding: 'SM2/SM3/SM4 参考实现均通过 KAT 验证，算法逻辑严格依照国标',
        status: 'compliant'
      },
      {
        file: 'www/docs/pqc-readiness.html §4',
        finding: 'SM2-MLKEM-768 混合方案：国密算法与 PQC 的工程化桥接',
        status: 'compliant'
      },
      {
        file: 'packages/sm2-ref/README.md',
        finding: '标注纯 JS 教育参考实现，建议生产环境使用硬件加密机',
        status: 'compliant'
      }
    ],
    note: 'SM2/3/4 作为教育参考实现已满足合规要求。商业部署需使用经认证的密码模块（如 SZD-SM2/SM3/SM4 密码卡）。PQC（ML-KEM/SLH-DSA）目前不属于中国商用密码标准体系，未来纳入后需相应更新。'
  }
];

// ═══════════════════════════════════════════
// 统计
// ═══════════════════════════════════════════
const stats = {
  total: CLAUSES.length,
  byCategory: {},
  byRiskLevel: {},
  avgScore: 0,
  fullyCompliant: 0,
  partialCompliant: 0,
  gaps: []
};

const categoryCN = {
  classification: '密码分类',
  policy: '政策鼓励',
  boundary: '适用边界',
  commercial: '商用密码管理',
  governance: '安全管理与治理'
};

const chapterIcons = {
  '第一章 总则': '📋',
  '第二章 核心密码与普通密码': '🔐',
  '第三章 商用密码': '🏢',
  '第四章 法律责任': '⚖️',
  '第五章 附则': '📎'
};

CLAUSES.forEach(c => {
  stats.byCategory[c.category] = (stats.byCategory[c.category] || 0) + 1;
  stats.byRiskLevel[c.riskLevel] = (stats.byRiskLevel[c.riskLevel] || 0) + 1;
  stats.avgScore += c.score;
  
  if (c.score >= 95) stats.fullyCompliant++;
  else if (c.score >= 70) stats.partialCompliant++;
  
  if (c.evidence) {
    c.evidence.forEach(e => {
      if (e.gap) stats.gaps.push({ clause: c.article + ' ' + c.title, gap: e.gap });
    });
  }
  if (c.gap) stats.gaps.push({ clause: c.article + ' ' + c.title, gap: c.gap });
});

stats.avgScore = Math.round(stats.avgScore / CLAUSES.length);

const output = {
  version: 'v1.0.0',
  source: '@fibemate/cryptolaw-assessment',
  generatedAt: new Date().toISOString(),
  legalBasis: '《中华人民共和国密码法》(2020年1月1日施行) · 5章44条',
  scopeNote: '仅覆盖开源 PQC 教育/验证平台 FIBEMATE，不替代法律意见。',
  stats,
  clauses: CLAUSES.map(c => ({ ...c, categoryCN: categoryCN[c.category] || c.category }))
};

// 写入目标文件
const dest = path.join(__dirname, '..', 'www', 'docs', 'cryptolaw-data.json');
fs.writeFileSync(dest, JSON.stringify(output, null, 2), 'utf-8');
console.log(`✅ ${CLAUSES.length} clauses written to ${dest}`);
console.log(`   Avg score: ${stats.avgScore}/100`);
console.log(`   Fully compliant: ${stats.fullyCompliant} | Partial: ${stats.partialCompliant}`);
console.log(`   Gaps found: ${stats.gaps.length}`);

// 打印 gap 概要
stats.gaps.forEach(g => console.log(`   ⚠ ${g.clause}: ${g.gap.substring(0, 80)}...`));
