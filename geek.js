
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * ============================================================================
 *  MS REWARDS GEEK CLI (TITANIUM EDITION)
 * ============================================================================
 *  纯 Node.js 实现，无浏览器依赖，直连微软服务器。
 * 
 *  [使用说明]
 *  1. 从 Web 版 "本地备份" 导出一个 JSON 文件。
 *  2. 将其重命名为 'accounts.json' 并放在项目根目录。
 *  3. 运行: npm run geek
 * ============================================================================
 */

// --- 配置区域 ---
const CONFIG = {
    // 每次请求间的最小/最大延迟 (毫秒)
    minDelay: 2000,
    maxDelay: 5000,
    // 是否并发执行 (true: 同时跑所有号, false: 一个个跑)
    concurrent: false, 
    // 忽略风控警告强制执行
    ignoreRisk: false,
    // 存档文件名
    dbFile: 'accounts.json'
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
const randomDelay = () => delay(Math.floor(Math.random() * (CONFIG.maxDelay - CONFIG.minDelay + 1) + CONFIG.minDelay));
const getTimestamp = () => new Date().toLocaleTimeString('en-US', { hour12: false });
const getRandomUUID = () => crypto.randomUUID();

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

// 简单的 Fetch 封装 (Node.js 原生 fetch 在 v18+ 可用，这里用 https 模块以兼容旧版或更底层控制)
// 为了简便，我们检测环境，如果有 fetch (Node 18+) 则使用，否则报错提示升级
if (!globalThis.fetch) {
    console.error(COLORS.red + "Error: Node.js version too low. Please upgrade to Node 18+." + COLORS.reset);
    process.exit(1);
}

const request = async (url, options = {}) => {
    const headers = { ...options.headers };
    
    // 自动处理 JSON
    if (options.body && typeof options.body === 'object') {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }

    // 简单的重试机制
    let retries = 3;
    while (retries > 0) {
        try {
            const res = await fetch(url, { ...options, headers });
            return res;
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
        // date number YYYYMMDD
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
        // 检查结果
        if (data.response && data.response.activity) return data.response.activity.p || 0;
        if (JSON.stringify(data).toLowerCase().includes('already')) return 0; // 已签到
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

// --- 主流程逻辑 ---

const processAccount = async (account) => {
    const name = account.name || 'Unknown';
    let currentToken = account.accessToken;
    let currentRefreshToken = account.refreshToken;
    let updated = false;

    log('info', '开始执行任务...', name);

    try {
        // 1. 检查/刷新 Token
        if (!account.tokenExpiresAt || Date.now() > account.tokenExpiresAt - 300000) { // 提前5分钟刷新
            log('warn', 'Token 即将过期，正在刷新...', name);
            const tokens = await AuthService.renewToken(currentRefreshToken);
            currentToken = tokens.accessToken;
            currentRefreshToken = tokens.refreshToken;
            account.accessToken = tokens.accessToken;
            account.refreshToken = tokens.refreshToken;
            account.tokenExpiresAt = Date.now() + (tokens.expiresIn * 1000);
            updated = true;
            log('success', 'Token 刷新成功', name);
        }

        // 2. 获取初始状态
        const dashboard = await TaskService.getDashboard(currentToken);
        const startPoints = dashboard.totalPoints;
        
        // 3. 执行签到
        await randomDelay();
        try {
            const earned = await TaskService.sign(currentToken);
            if (earned > 0) log('success', `签到成功: +${earned} 分`, name);
            else log('info', '今日已签到', name);
        } catch (e) {
            log('error', `签到失败: ${e.message}`, name);
        }

        // 4. 执行阅读
        const readMax = 30; // 假设30分
        // 简单的阅读逻辑，循环读取
        // 注意：这里没有复杂的进度判断，Geek模式假设每次运行都尝试读满
        log('info', '开始阅读任务...', name);
        for (let i = 0; i < 30; i++) {
            await delay(1000 + Math.random() * 2000); // 快速阅读
            try {
                await TaskService.read(currentToken);
                process.stdout.write(COLORS.green + '.' + COLORS.reset); // 进度点
            } catch (e) {
                process.stdout.write(COLORS.red + 'x' + COLORS.reset);
            }
        }
        console.log(''); // 换行

        // 5. 最终状态
        const finalDash = await TaskService.getDashboard(currentToken);
        const totalEarned = finalDash.totalPoints - startPoints;
        
        log('success', `任务完成! 本次收益: ${COLORS.bright}${totalEarned}${COLORS.reset} | 总分: ${COLORS.yellow}${finalDash.totalPoints}${COLORS.reset}`, name);

        // 更新账号信息
        account.totalPoints = finalDash.totalPoints;
        account.lastRunTime = Date.now();
        account.stats = finalDash.stats; // 简单的兼容
        updated = true;

    } catch (e) {
        log('error', `致命错误: ${e.message}`, name);
        if (e.message.includes('suspended')) {
            account.status = 'risk';
            updated = true;
        }
    }

    return { updated, account };
};

// --- 主程序入口 ---

const printBanner = () => {
    console.clear();
    console.log(COLORS.blue + `
  ██████╗ ███████╗███████╗██╗  ██╗
 ██╔════╝ ██╔════╝██╔════╝██║ ██╔╝
 ██║  ███╗█████╗  █████╗  █████╔╝ 
 ██║   ██║██╔══╝  ██╔══╝  ██╔═██╗ 
 ╚██████╔╝███████╗███████╗██║  ██╗
  ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
    ` + COLORS.reset);
    console.log(`${COLORS.bgBlue} MS REWARDS TITANIUM CLI ${COLORS.reset} v3.9.1`);
    console.log(`${COLORS.dim}----------------------------------------${COLORS.reset}`);
};

const run = async () => {
    printBanner();

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const dbPath = path.join(__dirname, CONFIG.dbFile);

    if (!fs.existsSync(dbPath)) {
        log('error', `未找到配置文件: ${CONFIG.dbFile}`);
        console.log(`\n${COLORS.yellow}请从 Web 版导出 '本地备份 (JSON)'，重命名为 'accounts.json' 并放入项目根目录。${COLORS.reset}`);
        process.exit(1);
    }

    let dbData;
    try {
        const raw = fs.readFileSync(dbPath, 'utf-8');
        dbData = JSON.parse(raw);
    } catch (e) {
        log('error', '配置文件 JSON 格式错误');
        process.exit(1);
    }

    const accounts = dbData.accounts || [];
    const validAccounts = accounts.filter(a => a.enabled !== false);

    log('system', `加载了 ${accounts.length} 个账号，其中 ${validAccounts.length} 个启用。`);
    
    let hasUpdates = false;

    // 执行循环
    for (const acc of validAccounts) {
        log('system', '----------------------------------------');
        const { updated, account: updatedAcc } = await processAccount(acc);
        if (updated) hasUpdates = true;
        
        // 更新内存中的数据
        const idx = accounts.findIndex(a => a.id === acc.id);
        if (idx !== -1) accounts[idx] = updatedAcc;

        if (!CONFIG.concurrent && validAccounts.indexOf(acc) < validAccounts.length - 1) {
            const waitTime = Math.floor(Math.random() * 3000) + 2000;
            log('system', `等待 ${waitTime}ms 进入下一个账号...`);
            await delay(waitTime);
        }
    }

    // 保存回写
    if (hasUpdates) {
        log('system', '----------------------------------------');
        log('system', '正在保存数据回磁盘...');
        dbData.accounts = accounts;
        // 仅在任务成功后更新导出时间，保留其他配置
        dbData.exportDate = new Date().toISOString();
        fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2), 'utf-8');
        log('success', '数据已保存 (Token 已刷新)');
    }

    console.log(`\n${COLORS.green}All Tasks Completed.${COLORS.reset}`);
};

run().catch(e => console.error(e));
