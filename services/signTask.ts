
import { getRandomUUID } from '../utils/helpers';
import { fetchWithProxy, checkRisk } from './request';

// 获取北京时间 (UTC+8) 的日期数值 (YYYYMMDD) - 返回 Number
const getBeijingDateNum = (): number => {
    const now = new Date();
    // 计算 UTC 时间戳: 当前时间 + (本地时区偏差转回UTC) + 8小时
    const utc8 = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 8 * 3600000);
    
    const year = utc8.getFullYear();
    const month = String(utc8.getMonth() + 1).padStart(2, '0');
    const day = String(utc8.getDate()).padStart(2, '0');
    return parseInt(`${year}${month}${day}`, 10);
};

// 基础 URL (不带 Query Params，避免风控)
const BASE_ACTIVITY_URL = "https://prod.rewardsplatform.microsoft.com/dapi/me/activities";

// 定义统一的请求头，模拟 Android 原生客户端行为
const COMMON_HEADERS = (accessToken: string) => ({
    "Content-Type": "application/json",
    "Accept": "application/json",
    "channel": "SAAndroid",
    "User-Agent": "okhttp/4.9.1", // 关键：使用底层网络库 UA 而非浏览器 UA
    "Authorization": `Bearer ${accessToken}`
});

// ----------------------------------------------------------------
// 子任务 A: 通用移动端签到 (Type 103)
// 作用：维持 App 活跃状态 (Heartbeat)，通常不直接给分
// ----------------------------------------------------------------
const signType103 = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean): Promise<{ points: number; msg: string; success: boolean }> => {
    try {
        const response = await fetchWithProxy(
            BASE_ACTIVITY_URL, 
            { 
                method: "POST", 
                headers: COMMON_HEADERS(accessToken), 
                body: JSON.stringify({ 
                    "amount": 1, 
                    "attributes": {}, 
                    "id": getRandomUUID(), 
                    "type": 103, 
                    "country": "cn", 
                    "risk_context": {}, 
                    "channel": "SAAndroid" 
                }) 
            }, 
            proxyUrl
        );
        const data = await response.json();
        
        const riskMsg = checkRisk(data, response.status);
        if (riskMsg && !ignoreRisk && !riskMsg.includes("Suspended") && !riskMsg.includes("403")) {
             // 仅记录不中断
        } else if (riskMsg && !ignoreRisk) {
             return { points: 0, msg: `通用Risk: ${riskMsg}`, success: false };
        }

        if (data.error) return { points: 0, msg: `通用错误: ${data.message || data.code}`, success: false };
        
        let earned = 0;
        if (data?.response?.activity?.p) earned = Number(data.response.activity.p);
        
        // 103 只要不报错就算成功
        if (earned > 0) return { points: earned, msg: `通用签到+${earned}`, success: true };
        return { points: 0, msg: "通用活跃已发", success: true };
    } catch (e: any) {
        return { points: 0, msg: `通用异常`, success: false };
    }
};

// ----------------------------------------------------------------
// 子任务 B: Sapphire APP 签到 (Type 101)
// 作用：获取每日签到奖励 (通常 10-20 分)
// ----------------------------------------------------------------
const signSapphire = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean): Promise<{ points: number; msg: string; success: boolean }> => {
    const todayNum = getBeijingDateNum();
    console.log(`[Task] Executing Sapphire Sign-in (101)... Date=${todayNum}`);

    // 关键 Payload 结构 (已验证成功)
    const payload = {
        "amount": 1,
        "attributes": {
            "offerid": "Gamification_Sapphire_DailyCheckIn",
            "date": todayNum, // 必须是整数格式 YYYYMMDD
            "signIn": false,  // 必须是布尔值 false (反直觉但必需)
            "timezoneOffset": "08:00:00" // 必须是字符串格式
        },
        "id": "", // 必须为空字符串
        "type": 101, 
        "country": "cn",
        "risk_context": {},
        "channel": "SAAndroid"
    };

    try {
        const response = await fetchWithProxy(
            BASE_ACTIVITY_URL, 
            { 
                method: "POST", 
                headers: COMMON_HEADERS(accessToken), 
                body: JSON.stringify(payload) 
            }, 
            proxyUrl
        );
        const data = await response.json();

        // 检查风控
        const riskMsg = checkRisk(data, response.status);
        if (riskMsg && !ignoreRisk) {
            if (riskMsg.includes("Suspended") || riskMsg.includes("403")) {
                return { points: 0, msg: `Sapphire Risk: ${riskMsg}`, success: false };
            }
        }

        // 检查错误 (重复签到等)
        if (data.error) {
            const errDesc = data.error.description || data.message || "";
            // 如果是 Duplicate 或 Already done，视为成功状态
            if (errDesc.toLowerCase().includes("duplicate") || errDesc.toLowerCase().includes("already")) {
                return { points: 0, msg: "Sapphire已签", success: true };
            }
            return { points: 0, msg: `Sapphire错误: ${errDesc}`, success: false };
        }

        // 提取积分
        let earned = 0;
        if (data?.response?.activity?.p) earned = Number(data.response.activity.p);

        if (earned > 0) {
            return { points: earned, msg: `Sapphire签到+${earned}`, success: true };
        }
        
        // 成功但0分，通常意味着今日已签但未触发重复错误，也视为成功
        return { points: 0, msg: "Sapphire完成(0分)", success: true };

    } catch (e: any) {
        console.error(`[Sapphire] Error:`, e);
        return { points: 0, msg: `Sapphire异常: ${e.message}`, success: false };
    }
};

// ----------------------------------------------------------------
// 主入口：执行双重签到
// ----------------------------------------------------------------
export const taskSign = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; points: number; message: string }> => {
  try {
    // 1. 执行通用签到 (Type 103)
    const res1 = await signType103(accessToken, proxyUrl, ignoreRisk);
    
    // 随机延迟 (模拟真实操作间隔)
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    // 2. 执行 Sapphire 签到 (Type 101)
    const res2 = await signSapphire(accessToken, proxyUrl, ignoreRisk);

    // 汇总结果
    const totalPoints = res1.points + res2.points;
    
    // 只要 Sapphire 成功 (无论拿分还是已签)，或者 103 成功，整体都算 Pass
    // 重点在于 Sapphire 的状态
    const isSuccess = res2.success; 
    
    // 构造合并消息
    let finalMsg = "";
    
    if (res1.points > 0 || res2.points > 0) {
        // 如果有拿分，详细显示
        finalMsg = `双重签到: +${totalPoints} (通用:+${res1.points}, Sapphire:+${res2.points})`;
    } 
    else if (res2.msg.includes("已签") || res2.msg.includes("完成")) {
        // 如果 Sapphire 明确显示已完成
        finalMsg = "今日双重签到已完成";
    } 
    else {
        // 其他情况 (如失败或无响应)
        finalMsg = `[通用] ${res1.msg} | [Sapphire] ${res2.msg}`;
    }

    return { 
        success: isSuccess, 
        points: totalPoints, 
        message: finalMsg 
    };

  } catch (error: any) { 
      throw error; 
  }
};
