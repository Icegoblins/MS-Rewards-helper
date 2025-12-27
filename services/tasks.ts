
import { getRandomUUID } from '../utils/helpers';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 签入任务模块
export const taskSign = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; points: number; message: string }> => {
   try {
    const response = await fetchWithProxy("https://prod.rewardsplatform.microsoft.com/dapi/me/activities", { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "authorization": `Bearer ${accessToken}`, ...CN_HEADERS }, body: JSON.stringify({ "amount": 1, "attributes": {}, "id": getRandomUUID(), "type": 103, "country": "cn", "risk_context": {}, "channel": "SAAndroid" }) }, proxyUrl);
    const data = await response.json();
    
    const riskMsg = checkRisk(data, response.status); 
    if (riskMsg) {
        if (ignoreRisk && !riskMsg.includes("Suspended") && !riskMsg.includes("403")) {
             console.warn(`[Ignore Risk] Sign Task: Detected ${riskMsg}, continuing...`);
        } else {
             throw new Error(riskMsg);
        }
    }
    
    if (data.error) return { success: false, points: 0, message: `签入错误: ${data.message || data.code}` };
    
    let earned = 0;
    if (data?.response?.activity?.p) earned = Number(data.response.activity.p);
    
    const status = data?.response?.activity?.status;
    if (earned > 0) return { success: true, points: earned, message: `签入成功 +${earned}` };
    if (status === "Complete") return { success: true, points: 0, message: "重复签入 (Complete)" };
    
    return { success: true, points: 0, message: "签入操作完成" };
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
