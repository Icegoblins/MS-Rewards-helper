
import { AccountStats } from '../types';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 获取极简数据 (只关心总分和阅读进度)
export const getDashboardData = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ 
    totalPoints: number, 
    stats: AccountStats 
}> => {
  try {
    const response = await fetchWithProxy("https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613&country=cn&market=zh-CN", { 
        method: "GET", 
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "authorization": `Bearer ${accessToken}`, ...CN_HEADERS } 
    }, proxyUrl);
    
    const appDataRaw = await response.json();
    
    if (appDataRaw) {
        const riskMsg = checkRisk(appDataRaw, response.status); 
        if (riskMsg) {
            // 如果开启了忽略风控，且错误类型不是“封禁(Suspended)”，则仅警告
            if (ignoreRisk && !riskMsg.includes("Suspended") && !riskMsg.includes("403")) {
                console.warn(`[Ignore Risk] Detected: ${riskMsg}, but continuing...`);
            } else {
                throw new Error(riskMsg);
            }
        }
    }
    
    const appResponse = appDataRaw?.response || {};
    const totalPoints = appResponse.balance ?? 0;

    let stats: AccountStats = {
        readProgress: 0, 
        readMax: 30
    };

    // 只提取阅读任务进度
    const pro = appResponse.promotions;
    if (pro && Array.isArray(pro)) {
      for (const o of pro) {
        if (o.attributes && o.attributes.offerid === "ENUS_readarticle3_30points") {
          stats.readMax = Number(o.attributes.max || 30);
          stats.readProgress = Number(o.attributes.progress || 0);
        }
      }
    }

    return { totalPoints, stats };

  } catch (error: any) {
    if (error.message && error.message.includes('401')) throw new Error("鉴权失败 (401)");
    throw error;
  }
};
