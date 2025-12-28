
import { getRandomUUID } from '../utils/helpers';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 阅读任务模块
export const taskRead = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetchWithProxy("https://prod.rewardsplatform.microsoft.com/dapi/me/activities", { method: "POST", headers: { "content-type": "application/json; charset=UTF-8", "authorization": `Bearer ${accessToken}`, ...CN_HEADERS }, body: JSON.stringify({ "amount": 1, "country": "cn", "id": getRandomUUID(), "type": 101, "attributes": { "offerid": "ENUS_readarticle3_30points", }, "risk_context": {}, "channel": "SAAndroid" }) }, proxyUrl);
    
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
