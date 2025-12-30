
import { getRandomUUID } from '../utils/helpers';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

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

// 基础 URL
const BASE_ACTIVITY_URL = "https://prod.rewardsplatform.microsoft.com/dapi/me/activities";

// 定义统一的请求头
const COMMON_HEADERS = (accessToken: string) => ({
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "okhttp/4.9.1", 
    "Authorization": `Bearer ${accessToken}`,
    "channel": "SAAndroid", 
    ...CN_HEADERS 
});

// ----------------------------------------------------------------
// 子任务 A: 通用移动端活跃心跳 (Type 103)
// 作用：维持 App 活跃状态，不仅是为了拿分，也是为了激活其他移动端任务
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
                    "attributes": {
                        "client": "android",
                        "timezoneOffset": "08:00:00" // 补充时区
                    }, 
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
             return { points: 0, msg: `Type 103 风控`, success: false };
        }

        let earned = 0;
        if (data?.response?.activity?.p) earned = Number(data.response.activity.p);
        
        if (earned > 0) return { points: earned, msg: `Type 103:+${earned}`, success: true };
        return { points: 0, msg: "Type 103:Activation", success: true };
    } catch (e: any) {
        return { points: 0, msg: `Type 103 异常`, success: false };
    }
};

// ----------------------------------------------------------------
// 子任务 B: Mobile App Bonus (Type 101) [新增]
// 作用：明确领取“使用 Start/Bing App”的 30 积分
// 注意：这经常是 Type 103 不给分时的真正得分点
// ----------------------------------------------------------------
const signMobileBonus = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean): Promise<{ points: number; msg: string; success: boolean }> => {
    try {
        const response = await fetchWithProxy(
            BASE_ACTIVITY_URL, 
            { 
                method: "POST", 
                headers: COMMON_HEADERS(accessToken), 
                body: JSON.stringify({ 
                    "amount": 1, 
                    "attributes": {
                        "offerid": "Gamification_Sapphire_MobileAppBonus",
                        "timezoneOffset": "08:00:00"
                    }, 
                    "id": getRandomUUID(), 
                    "type": 101, 
                    "country": "cn", 
                    "risk_context": {}, 
                    "channel": "SAAndroid" 
                }) 
            }, 
            proxyUrl
        );
        const data = await response.json();
        
        const riskMsg = checkRisk(data, response.status);
        if (riskMsg && !ignoreRisk) {
             if (riskMsg.includes("Suspended") || riskMsg.includes("403")) return { points: 0, msg: `Bonus风控`, success: false };
        }

        let earned = 0;
        if (data?.response?.activity?.p) earned = Number(data.response.activity.p);
        
        if (earned > 0) return { points: earned, msg: `Bonus:+${earned}`, success: true };
        
        // 如果这里也没分，且没有错误，可能是已经领过了
        if (!data.error) return { points: 0, msg: "Bonus:OK", success: true };
        
        return { points: 0, msg: "Bonus:无", success: true };
    } catch (e: any) {
        return { points: 0, msg: `Bonus异常`, success: false };
    }
};

// ----------------------------------------------------------------
// 子任务 C: Sapphire APP 每日签到 (Type 101)
// 作用：获取每日签到奖励 (Check-in streak)
// ----------------------------------------------------------------
const signSapphire = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean): Promise<{ points: number; msg: string; success: boolean }> => {
    const todayNum = getBeijingDateNum();

    const payload = {
        "amount": 1,
        "attributes": {
            "offerid": "Gamification_Sapphire_DailyCheckIn",
            "date": todayNum, 
            "signIn": false, 
            "timezoneOffset": "08:00:00"
        },
        "id": getRandomUUID(), 
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

        const riskMsg = checkRisk(data, response.status);
        if (riskMsg && !ignoreRisk) {
            if (riskMsg.includes("Suspended") || riskMsg.includes("403")) {
                return { points: 0, msg: `SAPPHIRE 风控`, success: false };
            }
        }

        if (data.error) {
            const errDesc = data.error.description || data.message || "";
            if (errDesc.toLowerCase().includes("duplicate") || errDesc.toLowerCase().includes("already")) {
                return { points: 0, msg: "SAPPHIRE:已签", success: true };
            }
            return { points: 0, msg: `SAPPHIRE 错误`, success: false };
        }

        let earned = 0;
        if (data?.response?.activity?.p) earned = Number(data.response.activity.p);

        if (earned > 0) {
            return { points: earned, msg: `SAPPHIRE:+${earned}`, success: true };
        }
        return { points: 0, msg: "SAPPHIRE:OK", success: true };

    } catch (e: any) {
        return { points: 0, msg: `SAPPHIRE 异常`, success: false };
    }
};

// ----------------------------------------------------------------
// 主入口：执行三重签到 (活跃 -> Bonus -> 每日签到)
// ----------------------------------------------------------------
export const taskSign = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; points: number; message: string }> => {
  try {
    // 1. 活跃心跳 (Type 103)
    const res1 = await signType103(accessToken, proxyUrl, ignoreRisk);
    await new Promise(r => setTimeout(r, 1500));

    // 2. 移动端奖励 (Type 101 Bonus) - 解决 103 不给分的问题
    const res2 = await signMobileBonus(accessToken, proxyUrl, ignoreRisk);
    await new Promise(r => setTimeout(r, 1500));

    // 3. 每日签到 (Type 101 CheckIn)
    const res3 = await signSapphire(accessToken, proxyUrl, ignoreRisk);

    const totalPoints = res1.points + res2.points + res3.points;
    const isSuccess = res1.success || res2.success || res3.success; 
    
    // 构造详细日志
    // 示例: [103:活跃] [Bonus:+30] [CheckIn:已签]
    const msgParts = [];
    if (res1.msg !== "103:活跃") msgParts.push(`[${res1.msg}]`); // 只有异常或得分才显示 103，否则它是静默的
    msgParts.push(`[${res2.msg}]`);
    msgParts.push(`[${res3.msg}]`);

    const finalMsg = `${totalPoints > 0 ? `+${totalPoints}分 ` : ''}${msgParts.join(' ')}`;

    return { 
        success: isSuccess, 
        points: totalPoints, 
        message: finalMsg 
    };

  } catch (error: any) { 
      throw error; 
  }
};
