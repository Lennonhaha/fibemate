/**
 * FIBEMATE DingTalk Alert Module
 * Sends security alerts to DingTalk group via webhook
 */
const https = require('https');
const url = require('url');

const WEBHOOK_URL = process.env.DINGTALK_WEBHOOK_URL;
if (!WEBHOOK_URL) {
  console.error('[DingTalk] WARNING: DINGTALK_WEBHOOK_URL not set in .env');
}
const ALERT_KEYWORD = '[告警]';

function sendDingTalk(text, title) {
  const payload = JSON.stringify({
    msgtype: 'markdown',
    markdown: {
      title: title || 'FIBEMATE Alert',
      text: text
    }
  });

  const parsed = url.parse(WEBHOOK_URL);
  const options = {
    hostname: parsed.hostname,
    port: 443,
    path: parsed.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 5000
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const resp = JSON.parse(data);
        if (resp.errcode !== 0) {
          console.error('[DingTalk] Send failed:', resp.errmsg);
        } else {
          console.log('[DingTalk] Alert sent OK');
        }
      } catch (e) {}
    });
  });
  req.on('error', (e) => {
    console.error('[DingTalk] Network error:', e.message);
  });
  req.on('timeout', () => {
    req.destroy();
    console.error('[DingTalk] Timeout');
  });
  req.write(payload);
  req.end();
}

// Alert types
function alertPrekeyLow(userId, count, threshold) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const text = `## ${ALERT_KEYWORD} 预密钥即将耗尽\n\n` +
    `- **时间**: ${ts}\n` +
    `- **用户ID**: ${userId}\n` +
    `- **剩余**: ${count} 个\n` +
    `- **阈值**: ${threshold} 个\n` +
    `- **建议**: 客户端应立即补充预密钥池\n\n` +
    `> FIBEMATE 安全监控自动告警`;
  sendDingTalk(text, '预密钥不足');
}

function alertReplayAttack(userId, messageId) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const text = `## ${ALERT_KEYWORD} 消息重放攻击拦截\n\n` +
    `- **时间**: ${ts}\n` +
    `- **用户ID**: ${userId}\n` +
    `- **消息ID**: ${messageId}\n` +
    `- **类型**: 重复 messageId\n` +
    `- **状态**: 已拦截\n\n` +
    `> FIBEMATE 安全监控自动告警`;
  sendDingTalk(text, '重放攻击');
}

function alertFriendReqFlood(userId, ip) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const text = `## ${ALERT_KEYWORD} 好友请求限流触发\n\n` +
    `- **时间**: ${ts}\n` +
    `- **用户ID**: ${userId}\n` +
    `- **IP**: ${ip}\n` +
    `- **状态**: 已达到每小时上限，已拦截\n\n` +
    `> FIBEMATE 安全监控自动告警`;
  sendDingTalk(text, '好友请求限流');
}

function alertServiceDown(error) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const text = `## ${ALERT_KEYWORD} 服务异常\n\n` +
    `- **时间**: ${ts}\n` +
    `- **错误**: ${error}\n` +
    `- **状态**: 需要立即检查\n\n` +
    `> FIBEMATE 安全监控自动告警`;
  sendDingTalk(text, '服务异常');
}

function alertServiceUp(port) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const text = `## ${ALERT_KEYWORD} 服务已恢复\n\n` +
    `- **时间**: ${ts}\n` +
    `- **端口**: ${port}\n` +
    `- **状态**: 正常运行\n\n` +
    `> FIBEMATE 安全监控自动告警`;
  sendDingTalk(text, '服务恢复');
}

function alertIntegrity(files) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const list = files.slice(0, 10).map(f => `- ${f}`).join('\n');
  const more = files.length > 10 ? `\n- ... 还有 ${files.length - 10} 个文件` : '';
  const text = `## ${ALERT_KEYWORD} 文件完整性告警\n\n` +
    `- **时间**: ${ts}\n` +
    `- **变更文件数**: ${files.length}\n` +
    `- **文件列表**:\n${list}${more}\n\n` +
    `> FIBEMATE 安全监控自动告警 (integrity-check)`;
  sendDingTalk(text, '文件完整性');
}

function alertHighCpu(cpu, mem) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const text = `## ${ALERT_KEYWORD} 资源使用告警\n\n` +
    `- **时间**: ${ts}\n` +
    `- **CPU**: ${cpu}%\n` +
    `- **内存**: ${mem}%\n` +
    `- **状态**: 资源使用超过阈值\n\n` +
    `> FIBEMATE 安全监控自动告警`;
  sendDingTalk(text, '资源告警');
}

function alertSsHLogin(user, ip) {
  const ts = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const text = `## ${ALERT_KEYWORD} SSH 登录通知\n\n` +
    `- **时间**: ${ts}\n` +
    `- **用户**: ${user}\n` +
    `- **来源IP**: ${ip}\n\n` +
    `> FIBEMATE 安全监控自动告警`;
  sendDingTalk(text, 'SSH登录');
}

module.exports = {
  prekeyLow: alertPrekeyLow,
  replayAttack: alertReplayAttack,
  friendReqFlood: alertFriendReqFlood,
  serviceDown: alertServiceDown,
  serviceUp: alertServiceUp,
  integrity: alertIntegrity,
  highCpu: alertHighCpu,
  sshLogin: alertSsHLogin
};
