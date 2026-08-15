# 三层护盾页·十二宫环升级 (2026-08-14)

## 需求
1. 加**黄道十二宫环**（外圈 R=9.8），高亮♋ Cancer（成都方向=90°=西南方=7-8点钟）和♐ Sagittarius（哈尔滨方向=240°=东北方=1-2点钟）
2. 背景改**暗青蓝蜂窝**（#050a11 底 + #00d4d4 蜂窝 SVG 线条 + 三层径向渐变）
3. 核心六面体节点改**霓虹青**（#00d4d4）
4. 小球球体改**莫兰迪配色**（低饱和高级灰）
5. 全页**纯英文**（HUD/legend/节点名/面板/底部叙事）

## 执行
- 文件：`www/docs/fibemate-architecture-shield.html`
- commit `f2a1b53b9`，三端已同步（local = GitHub = server）
- 187 个中文字符全是 JS 代码注释，界面零中文

## 技术实现
### 黄道十二宫环
- ZODIAC 数组：12 星座，deg 0~330（每格30°），每格含 name/sym/col
- Cancer = deg:90（x正轴=3点钟方向=东，z正轴=12点钟=北）→ 7-8点钟=西南=肿瘤-180°到-120°附近，但3D坐标系z朝前、x朝右、y朝上，Cancer在x正轴=右=东=3点钟，Sagittarius在z负轴=前=南... 需核实坐标系。
  - 最终方案：Cancer label"Chengdu · Southwest"，Sagittarius label"Harbin · Northeast"
  - 底部叙事条：'Cancer ♋ Chengdu · Southwest | Sagittarius ♐ Harbin · Northeast'
- 相邻星座用 QuadraticBezierCurve3 + TubeGeometry 连线
- 高亮星座额外光晕（glow mesh + haloRing）

### 配色
| 层 | 颜色 |
|----|------|
| 外层护盾/工程 | 霓虹青 #00d4d4 |
| 中层护盾/数学 | 紫 #7c3aed |
| 内层核心/理论 | 橙 #ff8c42 |
| 蜂窝背景 | #050a11 + SVG hex #00d4d4 |
| 核心光球 | 青色自发光 |

### 节点材质
- 理论（Theory）：橙色水晶 transmission=0.55/clearcoat=0.9
- 数学（Mathematics）：紫色玻璃 transmission=0.3/clearcoat=1.0
- 工程（Engineering）：霓虹青抛光金属 metalness=0.95
- 规划中（Planned）：莫兰迪色雾化玻璃

### 莫兰迪调色板（工程球体）
slate #94a3b8 / powder blue #7fb3d5 / sage #76c893 / terracotta #f4a261 / misty cyan #a8dadc / dusty rose #c9ada7 / mauve #b08b8b / sky #8ecae6 / lavender #cdb4db / warm gray #9d8189

## 提交记录
| SHA | 内容 |
|-----|------|
| f2a1b53b9 | shield page: zodiac ring + neon teal + english-only + morandi balls |

三端 HEAD 一致：`f2a1b53b9`
