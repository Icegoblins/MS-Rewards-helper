
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

/**
 * ============================================================================
 *  MS REWARDS GEEK CLI (INTERACTIVE EDITION)
 * ============================================================================
 *  纯 Node.js 实现，交互式命令行界面。
 * 
 *  [使用说明]
 *  1. 运行: npm run geek
 *  2. 使用数字键选择功能
 * ============================================================================
 */

// --- 全局状态 & 配置 ---
const STATE = {
    // 默认配置
    minDelay: 2000,
    maxDelay: 5000,
    concurrent: false,
    ignoreRisk: false,
    dbFile: 'accounts.json',
    
    // 运行时数据
    dbData: null,
    accounts: [],
    dbPath: ''
};

// --- 常量定义 ---
const COLORS = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    bgBlue: "\x1b[44m",
    bgRed: "\x1b[41m",
};

const CN_HEADERS = {
    "x-rewards-country": "cn",
    "x-rewards-language": "zh",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "x-rewards-appid": "SAAndroid/31.4.2110003555",
    "x-rewards-ismobile": "true",
    "x-rewards-partnerid": "startapp",
    "x-rewards-flights": "rwgobig",
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36 EdgA/112.0.1722.59"
};

// --- 工具函数 ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => delay(Math.floor(Math.random() * (STATE.maxDelay - STATE.minDelay + 1) + STATE.minDelay));
const getTimestamp = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const getRandomUUID = () => crypto.randomUUID();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const ask = (q) => new Promise(resolve => rl.question(COLORS.cyan + q + COLORS.reset, resolve));
const clearScreen = () => console.log('\x1Bc');

const log = (type, msg, accountName = 'SYSTEM') => {
    const time = `[${getTimestamp()}]`;
    const label = accountName.padEnd(12).slice(0, 12);
    let color = COLORS.reset;
    let icon = '•';

    switch (type) {
        case 'info': color = COLORS.cyan; icon = 'ℹ'; break;
        case 'success': color = COLORS.green; icon = '✔'; break;
        case 'warn': color = COLORS.yellow; icon = '⚠'; break;
        case 'error': color = COLORS.red; icon = '✖'; break;
        case 'system': color = COLORS.magenta; icon = '⚙'; break;
    }

    console.log(`${COLORS.dim}${time}${COLORS.reset} ${COLORS.bright}${label}${COLORS.reset} | ${color}${icon} ${msg}${COLORS.reset}`);
};

// Node.js Fetch Wrapper
if (!globalThis.fetch) {
    console.error(COLORS.red + "Error: Node.js version too low. Please upgrade to Node 18+." + COLORS.reset);
    process.exit(1);
}

const request = async (url, options = {}) => {
    const headers = { ...options.headers };
    if (options.body && typeof options.body === 'object') {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    let retries = 3;
    while (retries > 0) {
        try {
            return await fetch(url, { ...options, headers });
        } catch (e) {
            retries--;
            if (retries === 0) throw e;
            await delay(1000);
        }
    }
};

// --- 核心服务 ---

const AuthService = {
    renewToken: async (refreshToken) => {
        const params = new URLSearchParams({
            client_id: "0000000040170455",
            refresh_token: refreshToken,
            grant_type: "refresh_token",
            redirect_uri: "https://login.live.com/oauth20_desktop.srf",
            scope: "service::prod.rewardsplatform.microsoft.com::MBI_SSL offline_access openid profile"
        });

        const res = await request("https://login.live.com/oauth20_token.srf", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
        });

        const data = await res.json();
        if (data.access_token) {
            return {
                accessToken: data.access_token,
                refreshToken: data.refresh_token,
                expiresIn: data.expires_in
            };
        }
        throw new Error(data.error_description || "Token Refresh Failed");
    }
};

const TaskService = {
    getDashboard: async (token) => {
        const res = await request("https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&country=cn&market=zh-CN", {
            method: "GET",
            headers: { "Authorization": `Bearer ${token}`, ...CN_HEADERS }
        });
        const data = await res.json();
        const response = data.response || data;
        return {
            totalPoints: response.balance || 0,
            dailySet: response.dashboard?.dailySetPromotions || {},
            promotions: response.promotions || []
        };
    },

    sign: async (token) => {
        const now = new Date();
        const dateNum = parseInt(`${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`);
        
        const payload = {
            "amount": 1,
            "attributes": {
                "offerid": "Gamification_Sapphire_DailyCheckIn",
                "date": dateNum,
                "signIn": false,
                "timezoneOffset": "08:00:00"
            },
            "id": getRandomUUID(),
            "type": 101,
            "country": "cn",
            "risk_context": {},
            "channel": "SAAndroid"
        };

        const res = await request("https://prod.rewardsplatform.microsoft.com/dapi/me/activities", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, ...CN_HEADERS },
            body: payload
        });
        
        const data = await res.json();
        if (data.response && data.response.activity) return data.response.activity.p || 0;
        if (JSON.stringify(data).toLowerCase().includes('already')) return 0;
        throw new Error(data.message || "Sign Failed");
    },

    read: async (token) => {
        const payload = {
            "amount": 1,
            "country": "cn",
            "id": getRandomUUID(),
            "type": 101,
            "attributes": { "offerid": "ENUS_readarticle3_30points" },
            "risk_context": {},
            "channel": "SAAndroid"
        };

        const res = await request("https://prod.rewardsplatform.microsoft.com/dapi/me/activities", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}`, ...CN_HEADERS },
            body: payload
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return true;
    }
};

// --- 数据管理 ---

const DB = {
    init: () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        STATE.dbPath = path.join(__dirname, STATE.dbFile);

        if (!fs.existsSync(STATE.dbPath)) {
            clearScreen();
            console.log(COLORS.red + `[Error] 未找到配置文件: ${STATE.dbFile}` + COLORS.reset);
            console.log(`\n请从 Web 版导出 '本地备份 (JSON)'，重命名为 'accounts.json' 并放入项目根目录。`);
            process.exit(1);
        }

        try {
            const raw = fs.readFileSync(STATE.dbPath, 'utf-8');
            STATE.dbData = JSON.parse(raw);
            STATE.accounts = STATE.dbData.accounts || [];
        } catch (e) {
            console.error('JSON Parse Error', e);
            process.exit(1);
        }
    },
    save: () => {
        if (!STATE.dbData) return;
        STATE.dbData.accounts = STATE.accounts;
        STATE.dbData.exportDate = new Date().toISOString();
        fs.writeFileSync(STATE.dbPath, JSON.stringify(STATE.dbData, null, 2), 'utf-8');
        log('system', '数据已回写至磁盘 (Token/Points Updated)');
    }
};

// --- 业务逻辑 ---

const processAccount = async (account) => {
    const name = account.name || 'Unknown';
    let currentToken = account.accessToken;
    let currentRefreshToken = account.refreshToken;
    let updated = false;

    log('info', '开始执行...', name);

    try {
        // 1. Token 检查
        if (!account.tokenExpiresAt || Date.now() > account.tokenExpiresAt - 300000) {
            log('warn', 'Token 过期/即将过期，刷新中...', name);
            const tokens = await AuthService.renewToken(currentRefreshToken);
            currentToken = tokens.accessToken;
            currentRefreshToken = tokens.refreshToken;
            account.accessToken = tokens.accessToken;
            account.refreshToken = tokens.refreshToken;
            account.tokenExpiresAt = Date.now() + (tokens.expiresIn * 1000);
            updated = true;
            log('success', 'Token 刷新成功', name);
        }

        // 2. 初始状态
        const dashboard = await TaskService.getDashboard(currentToken);
        const startPoints = dashboard.totalPoints;
        
        // 3. 签到
        await randomDelay();
        try {
            const earned = await TaskService.sign(currentToken);
            if (earned > 0) log('success', `签到 +${earned}`, name);
            else log('info', '今日已签', name);
        } catch (e) {
            log('error', `签到异常: ${e.message}`, name);
        }

        // 4. 阅读
        // 简单的阅读逻辑，循环读取
        log('info', '阅读任务开始...', name);
        process.stdout.write(COLORS.dim + '      Progress: ' + COLORS.reset);
        for (let i = 0; i < 30; i++) {
            await delay(1000 + Math.random() * 1500); 
            try {
                await TaskService.read(currentToken);
                process.stdout.write(COLORS.green + '.' + COLORS.reset);
            } catch (e) {
                process.stdout.write(COLORS.red + 'x' + COLORS.reset);
            }
        }
        console.log('');

        // 5. 最终状态
        const finalDash = await TaskService.getDashboard(currentToken);
        const totalEarned = finalDash.totalPoints - startPoints;
        
        log('success', `完成! 收益: ${COLORS.bright}${totalEarned}${COLORS.reset} | 总分: ${COLORS.yellow}${finalDash.totalPoints}${COLORS.reset}`, name);

        account.totalPoints = finalDash.totalPoints;
        account.lastRunTime = Date.now();
        account.stats = finalDash.stats;
        updated = true;

    } catch (e) {
        log('error', `终止: ${e.message}`, name);
        if (e.message.includes('suspended')) {
            account.status = 'risk';
            updated = true;
        }
    }

    return { updated, account };
};

// --- 菜单界面 ---

const printHeader = () => {
    clearScreen();
    console.log(COLORS.blue + `
  ██████╗ ███████╗███████╗██╗  ██╗
 ██╔════╝ ██╔════╝██╔════╝██║ ██╔╝
 ██║  ███╗█████╗  █████╗  █████╔╝ 
 ██║   ██║██╔══╝  ██╔══╝  ██╔═██╗ 
 ╚██████╔╝███████╗███████╗██║  ██╗
  ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
    ` + COLORS.reset);
    console.log(`${COLORS.bgBlue} MS REWARDS GEEK CLI ${COLORS.reset} v3.9.1`);
    console.log(`${COLORS.dim}----------------------------------------${COLORS.reset}`);
    
    const validCount = STATE.accounts.filter(a => a.enabled !== false).length;
    const totalPoints = STATE.accounts.reduce((sum, acc) => sum + (acc.totalPoints || 0), 0);
    
    console.log(` 📦 账号: ${COLORS.bright}${STATE.accounts.length}${COLORS.reset} (启用: ${validCount})`);
    console.log(` 💰 总分: ${COLORS.yellow}${totalPoints.toLocaleString()}${COLORS.reset}`);
    console.log(`${COLORS.dim}----------------------------------------${COLORS.reset}`);
};

const Actions = {
    runAll: async () => {
        const targets = STATE.accounts.filter(a => a.enabled !== false);
        if (targets.length === 0) {
            console.log(COLORS.yellow + "没有启用的账号。" + COLORS.reset);
            await ask("按回车返回...");
            return;
        }

        console.log(COLORS.green + `🚀 准备执行 ${targets.length} 个账号任务...` + COLORS.reset);
        let hasUpdates = false;

        for (const acc of targets) {
            log('system', '----------------------------------------');
            const { updated, account: updatedAcc } = await processAccount(acc);
            if (updated) hasUpdates = true;
            
            // 更新内存
            const idx = STATE.accounts.findIndex(a => a.id === acc.id);
            if (idx !== -1) STATE.accounts[idx] = updatedAcc;

            if (!STATE.concurrent && targets.indexOf(acc) < targets.length - 1) {
                const waitTime = Math.floor(Math.random() * 3000) + 2000;
                log('system', `等待 ${waitTime}ms ...`);
                await delay(waitTime);
            }
        }

        if (hasUpdates) DB.save();
        console.log(`\n${COLORS.green}✅ 批量任务完成。${COLORS.reset}`);
        await ask("按回车返回菜单...");
    },

    listAccounts: async () => {
        console.log(COLORS.cyan + "📋 账号列表" + COLORS.reset);
        STATE.accounts.forEach((acc, i) => {
            const status = acc.enabled === false ? `${COLORS.red}[禁用]${COLORS.reset}` : `${COLORS.green}[启用]${COLORS.reset}`;
            const points = acc.totalPoints ? acc.totalPoints.toLocaleString() : '---';
            const risk = acc.status === 'risk' ? ` ${COLORS.bgRed} RISK ${COLORS.reset}` : '';
            console.log(` ${String(i + 1).padStart(2)}. ${status} ${acc.name.padEnd(20)} 💰 ${points}${risk}`);
        });
        console.log("");
        await ask("按回车返回...");
    },

    settings: async () => {
        while (true) {
            printHeader();
            console.log(COLORS.cyan + "⚙️  设置 (Settings)" + COLORS.reset);
            console.log(` [1] 并发模式 (Concurrent): ${STATE.concurrent ? COLORS.green + 'ON' + COLORS.reset : COLORS.red + 'OFF' + COLORS.reset}`);
            console.log(` [2] 最小延迟 (Min Delay):  ${STATE.minDelay} ms`);
            console.log(` [3] 最大延迟 (Max Delay):  ${STATE.maxDelay} ms`);
            console.log(` [4] 忽略风控 (Ignore Risk):${STATE.ignoreRisk ? COLORS.red + 'ON' + COLORS.reset : COLORS.green + 'OFF' + COLORS.reset}`);
            console.log(` [0] 返回主菜单`);
            console.log("");

            const choice = await ask("请选择: ");
            if (choice === '0') return;
            if (choice === '1') STATE.concurrent = !STATE.concurrent;
            if (choice === '4') STATE.ignoreRisk = !STATE.ignoreRisk;
            if (choice === '2') {
                const val = await ask("输入毫秒数: ");
                if (!isNaN(val)) STATE.minDelay = parseInt(val);
            }
            if (choice === '3') {
                const val = await ask("输入毫秒数: ");
                if (!isNaN(val)) STATE.maxDelay = parseInt(val);
            }
        }
    },
    
    runSingle: async () => {
        console.log(COLORS.cyan + "▶️  单号运行模式" + COLORS.reset);
        const val = await ask("请输入账号序号 (1-" + STATE.accounts.length + "): ");
        const idx = parseInt(val) - 1;
        
        if (idx >= 0 && idx < STATE.accounts.length) {
            const acc = STATE.accounts[idx];
            console.log(`正在启动: ${acc.name}`);
            const { updated, account: updatedAcc } = await processAccount(acc);
            if (updated) {
                STATE.accounts[idx] = updatedAcc;
                DB.save();
            }
            await ask("任务结束，按回车返回...");
        } else {
            console.log(COLORS.red + "无效序号" + COLORS.reset);
            await delay(1000);
        }
    }
};

const mainMenu = async () => {
    while (true) {
        printHeader();
        console.log(` [1] 🚀 开始任务 (Run All Enabled)`);
        console.log(` [2] 📋 查看账号 (List Accounts)`);
        console.log(` [3] ▶️ 单号运行 (Run Specific)`);
        console.log(` [4] ⚙️ 调整配置 (Settings)`);
        console.log(` [0] 🚪 退出程序 (Exit)`);
        console.log("");

        const choice = await ask("请选择功能序号: ");

        switch (choice) {
            case '1': await Actions.runAll(); break;
            case '2': await Actions.listAccounts(); break;
            case '3': await Actions.runSingle(); break;
            case '4': await Actions.settings(); break;
            case '0': 
                console.log("Bye!"); 
                process.exit(0);
                break;
            default:
                break;
        }
    }
};

// --- 启动 ---
(async () => {
    DB.init();
    await mainMenu();
})();
