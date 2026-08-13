# PQC Desktop — Electron 桌面应用 设计文档

**类型**：Electron 桌面应用
**状态**：设计阶段
**优先级**：⭐⭐⭐

---

## 1. 产品定位

把 FIBEMATE 的 29 个可视化页面 + 文档中心打包为离线桌面应用。适合高校教学（教室可能无网）、企业内部培训、会议演示。

**一句话**："离线可用的 PQC 交互式教科书。"

---

## 2. 核心功能

### 2.1 课程导航（左侧栏）

```
┌──┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐
│ 📚 课程大纲                      │
│                                  │
│ 🔰 入门                          │
│  ├─ 1. 什么是后量子密码学        │
│  ├─ 2. Shor 算法与 Grover 算法   │
│  └─ 3. NIST PQC 标准化时间线     │
│                                  │
│ 🧮 格密码                        │
│  ├─ 4. ML-KEM 密钥封装流程  ← ● │
│  ├─ 5. NTT 蝶形运算 [3D]        │
│  └─ 6. 格拓扑结构 [3D]          │
│                                  │
│ 📝 哈希签名                      │
│  ├─ 7. SLH-DSA 哈希签名流程     │
│  └─ 8. ML-DSA 签名验证流程      │
│                                  │
│ 🇨🇳 国密算法                      │
│  ├─ 9. SM2 椭圆曲线详解          │
│  └─ 10. SM4 分组密码            │
│                                  │
│ 🔬 实验工具                      │
│  ├─ 11. VWZ 张量场              │
│  ├─ 12. LG 矩阵场               │
│  └─ 13. PQC 算法对比 [赛题]     │
│                                  │
│ ⚙️  实作                         │
│  ├─ 14. 编译运行 ML-KEM         │
│  ├─ 15. KAT 验证实验            │
│  └─ 16. TVLA 侧信道实验         │
│                                  │
│ [📊 学习进度: ████████░░ 80%]   │
└┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┘
```

### 2.2 进度追踪

- 每完成一个页面 → localStorage 标记
- 课程完成百分比（进度条）
- 课程证书生成（HTML 截图）

### 2.3 离线能力

- 所有 Three.js / Canvas 资源本地打包
- 零网络请求
- 启动时间 <2s（electron + 本地文件）

---

## 3. 技术栈

- Electron（主进程 + Chromium 渲染）
- 内容层：现有 29 个 HTML 页面（零修改）
- 导航层：手写 `<nav>` sidebar
- 打包：`electron-builder` → Windows `.exe` + macOS `.dmg` + Linux `.AppImage`

---

## 4. 文件结构

```
electron-app/
├── main.js           # Electron 主进程
├── preload.js        # 安全沙箱
├── nav.html          # 左侧导航栏
├── package.json      # electron + electron-builder
├── assets/
│   ├── icon.ico
│   └── icon.png
└── content/          # 29 个 HTML 页面（symlink → www/）
```

---

## 5. 与 FIBEMATE 官网的关系

- 内容同源（`www/` 目录）
- Electron 版本：离线、带课程导航、进度追踪
- 官网版本：在线、即时更新、用户可贡献

---

## 6. 实现细节（伪代码）

### 6.1 Electron 主进程 `main.js`

```js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,    // 安全沙箱
      nodeIntegration: false,     // 禁止渲染进程直接访问 Node
      sandbox: true,
    },
    title: 'FIBEMATE · PQC Desktop',
    icon: path.join(__dirname, 'assets/icon.png'),
  });

  // 加载导航页
  mainWindow.loadFile('nav.html');

  // 开发模式：打开 DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

### 6.2 Preload 安全桥 `preload.js`

```js
const { contextBridge, ipcRenderer } = require('electron');

// 只暴露最小 API 表面
contextBridge.exposeInMainWorld('fibemateDesktop', {
  // 导航到指定课程
  navigate: (lessonId) => ipcRenderer.send('navigate', lessonId),

  // 获取/保存学习进度
  getProgress: () => ipcRenderer.invoke('get-progress'),
  saveProgress: (data) => ipcRenderer.invoke('save-progress', data),

  // 课程证书导出
  exportCertificate: () => ipcRenderer.invoke('export-certificate'),

  // 窗口控制
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
});
```

### 6.3 IPC 处理器

```js
// main.js 中注册的 IPC handlers

// 课程进度存储（文件系统 → 跨会话持久化）
ipcMain.handle('get-progress', () => {
  const progressPath = path.join(app.getPath('userData'), 'progress.json');
  try {
    return JSON.parse(fs.readFileSync(progressPath, 'utf8'));
  } catch {
    return { solved: [], startedAt: new Date().toISOString() };
  }
});

ipcMain.handle('save-progress', (_, data) => {
  const progressPath = path.join(app.getPath('userData'), 'progress.json');
  fs.writeFileSync(progressPath, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
});

// 课程证书（将 nav.html 的进度区域截图为 PNG）
ipcMain.handle('export-certificate', async () => {
  const image = await mainWindow.webContents.capturePage({
    x: 0, y: 0, width: 800, height: 600,
  });
  const savePath = dialog.showSaveDialogSync({
    defaultPath: 'fibemate-certificate.png',
    filters: [{ name: 'PNG', extensions: ['png'] }],
  });
  if (savePath) fs.writeFileSync(savePath, image.toPNG());
  return savePath;
});
```

### 6.4 导航数据结构

```js
// nav.html 中使用的课程树
const COURSE_TREE = [
  {
    id: 'basics',
    title: '🔰 入门',
    lessons: [
      { id: 'l1',  title: '什么是后量子密码学',      file: 'docs/pqc-crash-course.html' },
      { id: 'l2',  title: 'Shor 算法与 Grover 算法', file: 'docs/quantum-threat.html' },
      { id: 'l3',  title: 'NIST PQC 标准化时间线',   file: 'docs/pqc-readiness.html' },
    ],
  },
  {
    id: 'lattice',
    title: '🧮 格密码',
    lessons: [
      { id: 'l4',  title: 'ML-KEM 密钥封装流程',      file: 'ml-kem-flow-animation.html' },
      { id: 'l5',  title: 'NTT 蝶形运算 [3D]',        file: 'kakeya-perron.html' },
      { id: 'l6',  title: '格拓扑结构 [3D]',           file: 'lattice-topology.html' },
      { id: 'l7',  title: 'LWE 困难性地貌 [3D]',       file: 'lwe-hardness-terrain.html' },
    ],
  },
  // ... 其余章节
];

// 页面嵌入方式
function loadLesson(lesson) {
  const content = document.getElementById('content');
  content.innerHTML = `<iframe src="content/${lesson.file}" 
    style="width:100%;height:100%;border:none;" 
    sandbox="allow-scripts allow-same-origin"></iframe>`;
}
```

### 6.5 打包配置 `package.json`

```json
{
  "name": "fibemate-pqc-desktop",
  "version": "3.3.0",
  "main": "main.js",
  "build": {
    "appId": "net.fibemate.pqc-desktop",
    "productName": "FIBEMATE PQC Desktop",
    "files": [
      "main.js", "preload.js", "nav.html",
      "assets/**", "content/**", "lib/**"
    ],
    "win":   { "target": "nsis",   "icon": "assets/icon.ico" },
    "mac":   { "target": "dmg",    "icon": "assets/icon.png" },
    "linux": { "target": "AppImage", "icon": "assets/icon.png" },
    "directories": { "output": "dist" }
  },
  "scripts": {
    "start":   "electron .",
    "pack":    "electron-builder --dir",
    "dist":    "electron-builder",
    "dist:all": "electron-builder -mwl"
  },
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

---

*冻结期状态：仅设计文档。伪代码不编译、不运行。8/31 后开发。*
