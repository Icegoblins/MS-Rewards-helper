

// @ts-ignore
import Cron from 'croner';
import { Account } from '../types';

export const getRandomUUID = (only = false): string => {
  // @ts-ignore
  const uuid = crypto.randomUUID();
  const sid = uuid.replace(/-/g, "").toUpperCase();
  return only ? sid : uuid;
};

export const getTimestamp = (start = 0, end = 13): number => {
  const timestamp = Date.now();
  const num = Number(timestamp.toString().substring(start, end));
  return num;
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const formatTime = (timestamp: number): string => {
  if (!timestamp) return '---';
  const d = new Date(timestamp);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export const formatTimeWithMs = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${ms}`;
};

// 获取当前本地时间的 ISO 格式字符串 (不带时区后缀，即 Wall Clock Time)
// 例如北京时间下午3点: "2025-12-29T15:00:00.000"
export const getCurrentLocalISOString = (): string => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = now.getFullYear();
    const month = pad(now.getMonth() + 1);
    const day = pad(now.getDate());
    const hours = pad(now.getHours());
    const minutes = pad(now.getMinutes());
    const seconds = pad(now.getSeconds());
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`;
};

export const formatShortDate = (date: Date | null): string => {
    if (!date) return '---';
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    
    if (isToday) return `今天 ${timeStr}`;
    // 如果不是今年，显示完整年份 (YYYY-MM-DD HH:mm)
    if (date.getFullYear() !== now.getFullYear()) {
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${timeStr}`;
    }
    // 如果是今年但不是今天，显示月日 (MM-DD HH:mm)
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${timeStr}`;
};

// 新增：将毫秒差转换为人性化时长字符串
// precise = true: Geek Mode (Total Hours:Min:Sec) e.g. 467:56:30
// precise = false: Normal Mode (dd:hh:mm:ss) e.g. 19d 11:56:30
export const formatDuration = (ms: number, precise: boolean = false): string => {
    if (ms <= 0) return '00:00:00';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (precise) {
        // Geek Mode: Display Total Hours
        const m = minutes % 60;
        const s = seconds % 60;
        return `${hours}:${pad(m)}:${pad(s)}`;
    }

    // Normal Mode: Days + HH:MM:SS
    const h = hours % 24;
    const m = minutes % 60;
    const s = seconds % 60;
    if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/**
 * 统一处理 Token/URL 输入校验与解析
 * @returns { type: 'code' | 'token', value: string } | null
 */
export const parseTokenInput = (input: string): { type: 'code' | 'token', value: string } | null => {
    if (!input || input.length < 10) return null;
    const trimmed = input.trim();

    // 1. 尝试解析为 URL (提取 code)
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            const urlObj = new URL(trimmed);
            // 优先查找 searchParams
            let code = urlObj.searchParams.get("code");
            
            // 其次查找 hash (sometimes code is in hash)
            if (!code && urlObj.hash) {
                const hashPart = urlObj.hash.startsWith('#') ? urlObj.hash.substring(1) : urlObj.hash;
                const hashParams = new URLSearchParams(hashPart);
                code = hashParams.get("code");
            }

            if (code) return { type: 'code', value: code };
        } catch (e) {
            // URL 解析失败，继续尝试作为普通字符串处理
        }
    }

    // 2. 尝试正则匹配 URL 中的 code (兜底)
    const codeMatch = trimmed.match(/[?&]code=([^&]+)/);
    if (codeMatch && codeMatch[1]) {
        return { type: 'code', value: decodeURIComponent(codeMatch[1]) };
    }

    // 3. 验证是否为 Refresh Token (通常以 M. 开头，长度较长)
    // Microsoft Refresh Token 格式通常为 M.C5... 或 M.R3...
    // 宽松校验：以 M. 开头且长度 > 20，或者纯 Base64 长字符串
    if (trimmed.startsWith('M.') && trimmed.length > 50) {
        return { type: 'token', value: trimmed };
    }
    
    // 某些旧版 Token 可能不带 M.，但非常长
    if (trimmed.length > 500 && !trimmed.includes(' ')) {
        return { type: 'token', value: trimmed };
    }

    return null;
};

/**
 * 使用 croner 库进行标准 Cron 校验
 * croner 支持无限制的日期范围 (解决 2026 问题)
 */
export const checkCronMatch = (cronExpression: string, date: Date = new Date()): boolean => {
  try {
      if (!cronExpression || !cronExpression.trim()) return false;
      
      // 创建 Cron 实例
      // @ts-ignore
      const job = new (Cron as any)(cronExpression);
      // 获取基于当前时间(减去一点缓冲)的下一次运行时间
      const next = job.nextRun(new Date(date.getTime() - 60000));
      
      if (!next) return false;

      // 检查下一次运行时间是否就在当前这一分钟内
      const diff = Math.abs(date.getTime() - next.getTime());
      return diff < 60000 && date.getMinutes() === next.getMinutes() && date.getHours() === next.getHours();
  } catch (e) {
      console.error("Cron Match Error", e);
      return false;
  }
};

/**
 * 使用 croner 获取下一次运行时间
 * 修复：显式传递 new Date() 以确保基于当前时间计算，防止任何默认缓存
 */
export const getNextRunDate = (cronExpression: string): Date | null => {
    try {
        if (!cronExpression) return null;
        // Explicitly start from now
        // @ts-ignore
        return new (Cron as any)(cronExpression).nextRun(new Date());
    } catch (e) {
        return null;
    }
};

export const getNextRunTime = (cronExpression: string): string => {
    return formatShortDate(getNextRunDate(cronExpression));
};

// --- 通用报告生成逻辑 (DRY) ---

/**
 * 计算账号今日积分增量
 */
export const getDailyDiff = (acc: Account): number => {
    let diff = 0;
    if (acc.pointHistory && acc.pointHistory.length > 0) {
        const todayStr = new Date().toDateString();
        const lastRecordNotToday = [...acc.pointHistory].reverse().find(h => new Date(h.date).toDateString() !== todayStr);
        
        if (lastRecordNotToday) {
            diff = acc.totalPoints - lastRecordNotToday.points;
        } else {
            // 如果只有今天的记录，且记录数 > 1，取最新减最旧；否则视为 0 或当日新增
            const firstToday = acc.pointHistory[0];
            diff = acc.totalPoints - firstToday.points;
        }
    }
    return diff;
};

/**
 * 生成标准化的账号状态报告 (Markdown)
 * @param account 账号对象
 * @param index 序号 (可选)
 * @param overrides 运行时数据覆盖 (用于自动任务执行后的即时报告)
 */
export const generateAccountReport = (
    account: Account, 
    index: number = 1, 
    overrides?: { status?: string, totalPoints?: number, earned?: number }
): string => {
    const totalPoints = overrides?.totalPoints ?? account.totalPoints;
    const status = overrides?.status ?? account.status;
    const earned = overrides?.earned; // 如果未提供，尝试计算 diff

    // 状态文案映射
    const statusMap: Record<string, string> = {
        'success': '✅ 成功', 
        'risk': '🚨 风险', 
        'error': '❌ 失败',
        'idle': '闲置',
        'running': '运行中',
        'waiting': '等待',
        'refreshing': '刷新中'
    };
    const statusStr = statusMap[status] || status;

    // 积分变化 (如果有明确的 earned 则显示本轮收益，否则显示今日增量)
    let diffStr = '';
    if (earned !== undefined) {
        // 自动任务场景：显示本轮收益 + 较昨日变化
        const dailyDiff = getDailyDiff({ ...account, totalPoints }); // 使用最新的分数计算Diff
        diffStr = `(本轮+${earned} | 较昨日${dailyDiff >= 0 ? '+' : ''}${dailyDiff})`;
    } else {
        // 静态展示场景：显示今日增量
        const dailyDiff = getDailyDiff(account);
        diffStr = `(今日${dailyDiff >= 0 ? '+' : ''}${dailyDiff})`;
    }

    const s = account.stats;
    const readStr = `${s.readProgress}/${s.readMax}`;
    const pcStr = `${s.pcSearchProgress}/${s.pcSearchMax}`;
    const mobStr = `${s.mobileSearchProgress}/${s.mobileSearchMax}`;
    const actStr = `${s.dailyActivitiesProgress || 0}/${s.dailyActivitiesMax || 0}`;
    const checkInStr = s.checkInProgress ? `已签 ${s.checkInProgress} 天` : '未签到';
    
    // Type 103 状态
    // 如果任务刚成功(status=success) 或者 记录显示今日已完成
    const isType103Done = (status === 'success') || !!(account.lastDailySuccess && new Date(account.lastDailySuccess).toDateString() === new Date().toDateString());
    const type103Str = isType103Done ? "Activation" : "未激活";

    // 格式化输出
    return `[${index}] ${account.name}
● 状态: ${statusStr}
● 积分: ${totalPoints.toLocaleString()} ${diffStr}
● 阅读: ${readStr}
● 搜索: 电脑 ${pcStr} | 移动 ${mobStr}
● 活动: ${actStr}
● 签到: SAPPHIRE ${checkInStr} | Type 103 ${type103Str}
-----------------------`;
};