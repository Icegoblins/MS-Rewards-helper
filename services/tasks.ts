
import { getRandomUUID } from '../utils/helpers';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 签入任务模块
export const taskSign = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; points: number; message: string }> => {
   try {
    // 构造日期数字 (YYYYMMDD)
    const now = new Date();
    const dateNum = parseInt(`${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`);

    // 参考 Python 脚本的 Payload
    const payload = {
        "amount": 1,
        "attributes": {
            "offerid": "Gamification_Sapphire_DailyCheckIn",
            "date": dateNum,
            "signIn": false,
            "timezoneOffset": "08:00:00" // 假定东八区
        },
        "id": getRandomUUID(),
        "type": 101, // Python 脚本使用 101
        "country": "cn",
        "risk_context": {},
        "channel": "SAAndroid"
    };

    const response = await fetchWithProxy("https://prod.rewardsplatform.microsoft.com/dapi/me/activities", { 
        method: "POST", 
        headers: { 
            "content-type": "application/json; charset=UTF-8", 
            "authorization": `Bearer ${accessToken}`, 
            ...CN_HEADERS 
        }, 
        body: JSON.stringify(payload) 
    }, proxyUrl);
    
    const data = await response.json();
    
    const riskMsg = checkRisk(data, response.status); 
    if (riskMsg) {
        if (ignoreRisk && !riskMsg.includes("Suspended") && !riskMsg.includes("403")) {
             console.warn(`[Ignore Risk] Sign Task: Detected ${riskMsg}, continuing...`);
        } else {
             throw new Error(riskMsg);
        }
    }
    
    if (data.error) {
        // 检查是否重复签到
        const errDesc = data.error.description || data.message || '';
        if (errDesc.toLowerCase().includes('already') || errDesc.toLowerCase().includes('duplicate')) {
            return { success: true, points: 0, message: "移动端签到已完成 (Sapphire Check-in Done)" };
        }
        return { success: false, points: 0, message: `签入错误: ${data.message || data.code}` };
    }
    
    let earned = 0;
    if (data?.response?.activity?.p) earned = Number(data.response.activity.p);
    
    // 如果没有返回积分但也没有报错，可能是之前签过了
    if (earned > 0) return { success: true, points: earned, message: `💎 Sapphire 签到成功 +${earned}` };
    
    return { success: true, points: 0, message: "签入操作完成 (无积分变动)" };
  } catch (error: any) { throw error; }
};

// 阅读任务模块
export const taskRead = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetchWithProxy("https://prod.rewardsplatform.microsoft.com/dapi/me/activities", { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "authorization": `Bearer ${accessToken}`, ...CN_HEADERS }, body: JSON.stringify({ "amount": 1, "country": "cn", "id": getRandomUUID(), "type": 101, "attributes": { "offerid": "ENUS_readarticle3_30points", }, "risk_context": {}, "channel": "SAAndroid" }) }, proxyUrl);
    
    // 阅读接口通常不返回详细 JSON，主要看 Status Code。
    // 如果返回了 JSON 且包含 Risk，也做检查
    try {
        const cloned = response.clone();
        const data = await cloned.json();
        const riskMsg = checkRisk(data, response.status);
        if (riskMsg) {
             if (ignoreRisk && !riskMsg.includes("Suspended") && !riskMsg.includes("403")) {
                 // Ignore
             } else {
                 return { success: false, message: riskMsg };
             }
        }
    } catch {}

    if (response.ok) { return { success: true, message: "阅读心跳" }; } 
    else { return { success: false, message: `阅读失败: ${response.status}` }; }
  } catch (error: any) { throw error; }
};
