# FIBEMATE 流量统计基线（2026-08-12 采集）

> 本地记录，不推送。用于 8/31 开源后对比参照。

## 采集时间
2026-08-12 22:37 GMT+8（D-18）

## GitHub 流量（近 14 天，7/29–8/11）

### 页面浏览（views）
- 总浏览：181 次
- 唯一访客：39 人

| 日期 | views | uniques |
|------|------:|------:|
| 07-29 | 32 | 8 |
| 07-30 | 7 | 6 |
| 07-31 | 16 | 2 |
| 08-01 | 17 | 1 |
| 08-02 | 19 | 9 |
| 08-03 | 20 | 7 |
| 08-04 | 7 | 3 |
| 08-05 | 30 | 7 |
| 08-06 | 1 | 1 |
| 08-07 | 14 | 2 |
| 08-08 | 1 | 1 |
| 08-09 | 8 | 1 |
| 08-10 | 1 | 1 |
| 08-11 | 8 | 3 |

### 克隆（clones）
- 总克隆：9239 次
- 唯一克隆者：409 人

> ⚠️ 克隆数虚高：人均 22 次，是自动化刷取（自身服务器 git pull、E 盘备份脚本、CI runner、dependabot 反复拉取）。真实陌生克隆者远小于 409。

### 峰值观察
- 8/2、8/5 出现浏览小高峰（19、30 次）
- 其余日个位数到十几
- 预热期正常水平

## 网站流量（今日 8/12，nginx access.log）

### 总量
- 总请求：2006 次
- 唯一 IP：191 个

### 来源拆解（诚实版）

| 来源 | 请求数 | 性质 |
|------|------:|------|
| 127.0.0.1 + ::1 | 1663 | 本地回环（自身 link-checker/监控） |
| AI 爬虫（ChatGPT-User 88+46、Amazonbot 83+78、Google-Extended 44） | ~390 | AI + 搜索爬虫 |
| Windows Chrome + iPhone Safari | ~365 | 大概率本人 + 极少数真实访客 |
| 其他 | 扫描器（WordPress 探测 403 等） | 噪声 |

### 今日状态码
200:1614 · 301:170 · 403:85 · 404:42 · 304:25 · 400:19 · 405:18 · 150:16

### 今日热门页面 TOP
1. / 517
2. /vwz-tensor/tensor-field.html 72
3. /docs/ 40
4. /docs/pqc-readiness.html 39
5. /lg-tensor/tensor-field.html 38
6. /vwz-tensor/portrait.html 37
7. /docs/pqc-dashboard.html 36
8. /wp-admin/install.php 35（WordPress 扫描，被 403 拦）
9. /vwz-challenge 34
10. /demo/ 34

### 浏览器 TOP
- link-check/5.6.0 459（自身 link checker）
- Windows Chrome 149 222
- iPhone Safari 13.2.3 143（用户本人）
- curl 120
- ChatGPT-User 88+46
- Amazonbot 83+78
- Google-Extended 44

## 结论
- GitHub 真实访客 39 人（14 天）
- 网站真实人类访客：每日个位到十位
- 主体流量 = 爬虫（AI + 搜索）索引新页面 + 用户自身 link-checker
- 属「刚上线预热期」正常水平，8/31 公告发布后才有真实参照意义
