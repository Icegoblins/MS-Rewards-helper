# MS Rewards 多账号助手 (Titanium Edition)

![Version](https://img.shields.io/badge/version-3.9.1-blueviolet)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-Stable-success)

基于 React + Vite + TypeScript 精心打造的微软积分 (Microsoft Rewards) 自动化管理系统。专为中国区账号设计，集成了任务自动化、多账号调度、云端同步与风险控制等企业级功能。

---

## ✨ 核心特性 (Features)

### 🤖 自动化内核 (Token System)
- **纯 Token 机制**：摒弃不稳定的 Cookie 方案，全面采用 OAuth Refresh Token 机制，凭证有效期更长，支持自动续期。
- **智能任务执行**：自动完成每日签入 (Daily Check-in) 与阅读任务 (Read Articles)。
- **拟人化操作**：内置随机延迟 (Random Delay) 与动态时间间隔，模拟真实用户行为。
- **风控保护**：自动识别 Suspended/Risk 状态并中止任务，支持配置“忽略风控”强制执行模式。

### 📅 精细的任务调度
- **全局 Cron 调度**：支持标准的 Crontab 表达式 (如 `0 4 * * *`)，实现无人值守的一键启动。
- **独立账号定时**：每个账号可配置独立的 Cron 表达式，支持错峰运行。
- **智能跳过策略**：支持“跳过今日已完成账号”策略，避免重复无效请求。

### ☁️ 数据安全与同步
- **WebDAV 云同步**：原生支持 **坚果云** 与 **InfiniCloud**，实现多设备间的数据无缝漫游。
- **本地自动备份**：支持配置策略，定期将账号数据快照保存到本地磁盘，支持版本回滚。
- **隐私优先**：核心凭证仅存储于本地浏览器 LocalStorage 或用户私有云盘，不经过任何第三方服务器。

### 📣 消息推送系统 (WxPusher)
- **多路分发**：支持创建多个推送目标 (如“家人”、“自己”)，实现消息分流。
- **定向过滤**：可为每个推送目标指定订阅的账号列表。
- **详细战报**：推送内容包含今日收益、总积分池、运行状态及较昨日积分变化。

---

## 🚀 快速部署 (Deployment)

### 1. 环境准备
确保您的环境已安装 [Node.js](https://nodejs.org/) (推荐 v18+)。

### 2. 获取代码
```bash
git clone https://github.com/Icegoblins/MS-Rewards-helper.git
cd MS-Rewards-Helper
```
**⚠️ 如果遇到 `port 443` 或 `Connection refused` 错误：**
- **方法 A (推荐)**：直接点击 GitHub 页面右上角绿色的 **Code** 按钮 -> **Download ZIP**，下载后解压。
- **方法 B (代理)**：如果你有本地代理工具 (例如端口 7890)，请配置 Git：
  ```bash
  git config --global http.proxy http://127.0.0.1:7890
  git config --global https.proxy http://127.0.0.1:7890
  ```

### 3. 启动服务 (推荐)

**方式 A：使用一键启动器 (推荐)**
- **Windows**: 双击运行根目录下的 `start.bat`。
- **macOS / Linux**: 在终端运行 `./start.sh` (需先赋予执行权限 `chmod +x start.sh`)。

> 启动器会自动检测环境，如果是第一次运行，它会自动执行 `npm install` 安装依赖，随后同时启动后台代理和网页前端。

**方式 B：手动安装与启动**
如果您喜欢手动控制，可以分步执行：
```bash
# 1. 安装依赖
npm install

# 2. 启动服务 (将同时运行代理和网页)
npm start
```

---

## ⚙️ 配置指南

### 1. 代理设置 (必须)
进入网页右上角的 **“全局设置”** -> **“网络 Net”**：
- 默认已填入 `http://127.0.0.1:3001` (推荐)。
- 该代理确保所有请求通过您的本机 IP 发出，避免账号被识别为异地登录。

### 2. 添加账号
1. 点击首页底部的 **“+ 添加新账号”** 卡片。
2. **获取凭证**：
   - 点击输入框上方的 **“获取授权”** 按钮，系统会将微软授权链接复制到剪贴板。
   - 在浏览器新标签页中打开该链接，并登录您的微软账号。
   - 登录成功后，页面会跳转（可能显示无法连接或空白），请直接 **复制此时浏览器地址栏的完整 URL**（包含 `code=...`）。
   - 回到本系统，点击 **“粘贴 Token”** (或手动粘贴 URL)，系统会自动解析并换取 Refresh Token。
3. 点击 **“+ 添加新账号”** 完成。

### 3. 开启自动任务
进入 **“任务调度”** (紫色按钮)：
- 启用开关。
- 设置 Cron 表达式 (推荐 `0 4 * * *`，即每天凌晨 4 点)。
- 系统将在后台自动倒计时，时间一到即触发“一键启动”。

---

## 🛠️ 目录结构

```text
/
├── start.bat           # [Win] 一键启动脚本
├── start.sh            # [Mac/Linux] 一键启动脚本
├── local_proxy.js      # [核心] 本地代理与文件系统服务 (Node.js)
├── src/
│   ├── components/     # React UI 组件 (Modals, Cards, Charts...)
│   ├── services/       # 业务逻辑 (Auth, Tasks, WxPusher...)
│   ├── utils/          # 工具函数 (Cron, Formatting...)
│   ├── App.tsx         # 主应用入口与调度器
│   └── types.ts        # TypeScript 类型定义
└── README.md           # 说明文档
```

---

## ⚠️ 免责声明

本项目仅供技术研究与学习使用。
1. 使用脚本自动化操作可能违反微软的服务条款。
2. 作者不对因使用本工具导致的账号封禁、积分清零或其他损失承担责任。
3. 请勿将本工具用于商业用途。

---

**Current Version:** v3.9.1 (Titanium)
**Build Date:** 2025