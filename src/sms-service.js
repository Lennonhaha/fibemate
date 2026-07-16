/**
 * FIBEMATE 短信服务模块
 * 阿里云短信 API 封装
 * 
 * 功能：
 * - 发送验证码
 * - 验证码校验
 * - 手机号绑定
 * 
 * 安全特性：
 * - 验证码 6 位数字
 * - 5 分钟过期
 * - 同一手机号 60 秒内只能发一次
 * - 验证码校验后自动删除（防重放）
 * - 暴力破解保护（5 次错误后锁定）
 */

const crypto = require('crypto');

// 阿里云短信 SDK（ICP 备案通过后安装）
// npm install @alicloud/dysmsapi20170525 @alicloud/openapi-client
let Dysmsapi20170525 = null;
let OpenApiClient = null;

try {
  Dysmsapi20170525 = require('@alicloud/dysmsapi20170525');
  OpenApiClient = require('@alicloud/openapi-client');
} catch (e) {
  console.warn('[SMS] ⚠ 阿里云短信 SDK 未安装，验证码将使用开发模式（控制台输出）');
}

// ========================
// 配置
// ========================

const SMS_CONFIG = {
  // 阿里云 AccessKey（ICP 备案通过后配置）
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET || '',
  // 短信签名（需与备案主体一致）
  signName: process.env.SMS_SIGN_NAME || 'FIBEMATE',
  // 验证码模板 Code（阿里云审核通过后获得）
  templateCode: process.env.SMS_TEMPLATE_CODE || '',
  // 验证码长度
  codeLength: 6,
  // 验证码过期时间（秒）
  codeExpiry: 300, // 5 分钟
  // 发送间隔（秒）
  sendInterval: 60, // 60 秒
  // 开发模式（无 SDK 时验证码输出到控制台）
  devMode: !Dysmsapi20170525,
};

// ========================
// 验证码存储（内存）
// ========================

const codeStore = new Map();

/**
 * 生成验证码
 * @param {string} phone 手机号
 * @returns {{ code: string, error: string|null }}
 */
function generateCode(phone) {
  // 检查发送间隔
  const existing = codeStore.get(phone);
  if (existing && Date.now() - existing.createdAt < SMS_CONFIG.sendInterval * 1000) {
    const remaining = Math.ceil((SMS_CONFIG.sendInterval * 1000 - (Date.now() - existing.createdAt)) / 1000);
    return { code: null, error: `发送太频繁，请${remaining}秒后再试` };
  }

  // 生成随机验证码
  const code = crypto.randomInt(Math.pow(10, SMS_CONFIG.codeLength - 1), Math.pow(10, SMS_CONFIG.codeLength)).toString();
  
  // 存储验证码
  codeStore.set(phone, {
    code,
    createdAt: Date.now(),
    attempts: 0,
    verified: false,
  });

  return { code, error: null };
}

/**
 * 清理过期验证码（定时执行）
 */
function cleanupExpiredCodes() {
  const now = Date.now();
  for (const [phone, data] of codeStore) {
    if (now - data.createdAt > SMS_CONFIG.codeExpiry * 1000) {
      codeStore.delete(phone);
    }
  }
}

// 每 60 秒清理过期验证码
setInterval(cleanupExpiredCodes, 60000);

// ========================
// 发送验证码
// ========================

/**
 * 发送验证码到手机
 * @param {string} phone 手机号
 * @returns {{ success: boolean, message: string }}
 */
async function sendVerificationCode(phone) {
  // 验证手机号格式（中国大陆）
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return { success: false, message: '手机号格式不正确' };
  }

  // 生成验证码
  const { code, error } = generateCode(phone);
  if (error) {
    return { success: false, message: error };
  }

  // 发送验证码
  if (SMS_CONFIG.devMode) {
    // 开发模式：输出到控制台
    console.log(`[SMS] 📱 验证码: ${code} → ${phone}`);
    return { success: true, message: '验证码已发送（开发模式，请查看服务器控制台）' };
  }

  // 生产模式：调用阿里云短信 API
  try {
    const config = new OpenApiClient.Config({
      accessKeyId: SMS_CONFIG.accessKeyId,
      accessKeySecret: SMS_CONFIG.accessKeySecret,
      endpoint: 'dysmsapi.aliyuncs.com',
    });
    const client = new Dysmsapi20170525(config);
    const request = new Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: phone,
      signName: SMS_CONFIG.signName,
      templateCode: SMS_CONFIG.templateCode,
      templateParam: JSON.stringify({ code }),
    });
    const response = await client.sendSms(request);
    
    if (response.body.code === 'OK') {
      return { success: true, message: '验证码已发送' };
    } else {
      console.error('[SMS] 发送失败:', response.body.code, response.body.message);
      return { success: false, message: '验证码发送失败，请稍后重试' };
    }
  } catch (e) {
    console.error('[SMS] 发送异常:', e.message);
    return { success: false, message: '验证码发送失败，请稍后重试' };
  }
}

// ========================
// 验证码校验
// ========================

/**
 * 校验验证码
 * @param {string} phone 手机号
 * @param {string} code 验证码
 * @returns {{ valid: boolean, message: string }}
 */
function verifyCode(phone, code) {
  const data = codeStore.get(phone);
  
  if (!data) {
    return { valid: false, message: '验证码不存在或已过期' };
  }

  // 检查过期
  if (Date.now() - data.createdAt > SMS_CONFIG.codeExpiry * 1000) {
    codeStore.delete(phone);
    return { valid: false, message: '验证码已过期，请重新获取' };
  }

  // 检查尝试次数（防暴力破解）
  if (data.attempts >= 5) {
    codeStore.delete(phone);
    return { valid: false, message: '验证码错误次数过多，请重新获取' };
  }

  // 校验验证码
  if (data.code === code) {
    data.verified = true;
    codeStore.delete(phone); // 验证成功后删除（防重放）
    return { valid: true, message: '验证成功' };
  }

  // 验证码错误
  data.attempts++;
  return { valid: false, message: '验证码错误' };
}

// ========================
// 导出
// ========================

module.exports = {
  sendVerificationCode,
  verifyCode,
  SMS_CONFIG,
};
