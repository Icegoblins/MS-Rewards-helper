
import { AccountStats } from '../types';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 获取完整的 Dashboard 数据 (增强版)
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
            if (ignoreRisk && !riskMsg.includes("Suspended") && !riskMsg.includes("403")) {
                console.warn(`[Ignore Risk] Detected: ${riskMsg}, but continuing...`);
            } else {
                throw new Error(riskMsg);
            }
        }
    }
    
    const appResponse = appDataRaw?.response || {};
    const totalPoints = appResponse.balance ?? 0;

    // --- DEBUG LOG START: 打印 API 根节点 Keys ---
    if (appResponse) {
        console.groupCollapsed(`📊 Dashboard Data Debug: ${new Date().toLocaleTimeString()}`);
        console.log("Raw Response Keys:", Object.keys(appResponse));
        
        if (!appResponse.redeemGoal) {
            console.warn("❌ [Goal Missing] Could not find 'redeemGoal' object in API response.");
        }
    }
    // --- DEBUG LOG END ---

    // 初始化统计数据
    let stats: AccountStats = {
        readProgress: 0, 
        readMax: 30,
        pcSearchProgress: 0,
        pcSearchMax: 0,
        mobileSearchProgress: 0,
        mobileSearchMax: 0,
        checkInProgress: 0,
        checkInMax: 0,
        dailyActivitiesProgress: 0,
        dailyActivitiesMax: 0,
        dailySetProgress: 0,
        dailySetMax: 0
    };

    // 尝试解析兑换目标
    if (appResponse.redeemGoal) {
        stats.redeemGoal = {
            title: appResponse.redeemGoal.title || '未知目标',
            price: Number(appResponse.redeemGoal.price) || 0,
            progress: Number(appResponse.redeemGoal.progress) || 0
        };
    }

    const pro = appResponse.promotions;
    if (pro && Array.isArray(pro)) {
      for (const o of pro) {
        const attrs = o.attributes || {};
        const offerId = (attrs.offerid || "").toLowerCase(); // 统一转小写比较
        const type = (attrs.type || "").toLowerCase();
        const title = o.title || attrs.title || "";
        const progress = Number(attrs.progress || 0);
        const max = Number(attrs.max || 0);

        // --- DEBUG LOG: 打印每个 Task 的详情 ---
        console.log(`[Task] ${title} (${attrs.offerid}): ${progress}/${max}`);
        // ------------------------------------

        // 1. 阅读任务
        if (offerId === "enus_readarticle3_30points") {
          stats.readMax = max > 0 ? max : 30;
          stats.readProgress = progress;
        }
        
        // 2. Sapphire App 签到 (Gamification_Sapphire_DailyCheckIn)
        else if (offerId === "gamification_sapphire_dailycheckin") {
            stats.checkInMax = max > 0 ? max : 7;
            stats.checkInProgress = progress;
        }

        // 3. 搜索任务 (Search)
        else if (offerId.includes("search")) {
            // PC 搜索 (匹配 'pc' 或 'level2')
            if (offerId.includes("pc") || offerId.includes("level2") || offerId.includes("desktop")) {
                if (max > stats.pcSearchMax) {
                    stats.pcSearchMax = max;
                    stats.pcSearchProgress = progress;
                }
            }
            // 移动搜索 (匹配 'mobile')
            else if (offerId.includes("mobile")) {
                if (max > stats.mobileSearchMax) {
                    stats.mobileSearchMax = max;
                    stats.mobileSearchProgress = progress;
                }
            }
        }
        
        // 4. 日常活动 (Daily Activities / More Activities)
        // 包含: DailyGlobalOffer, ZHCN_Rewards, ZHstar_Rewards, Campaign 等
        else if (
            
            offerId.includes("zhcn") || 
            offerId.includes("zhstar") ||
            offerId.includes("campaign")
        ) {
             if (max > 0) {
                 stats.dailyActivitiesMax += max;
                 stats.dailyActivitiesProgress += progress;
             }
        }

        // 5. Daily Set Streak (排除已被上方规则捕获的 5 分任务)
        // 通常是 3 个一组的任务集，offerId 包含 dailyset 但不含 dailyglobaloffer
        else if (offerId.includes("dailyset")) {
             if (max > 0) {
                 stats.dailySetMax += max;
                 stats.dailySetProgress += progress;
             }
        }

        
      }
    }
    
    // --- DEBUG LOG END GROUP ---
    console.groupEnd();

    return { totalPoints, stats };

  } catch (error: any) {
    if (error.message && error.message.includes('401')) throw new Error("鉴权失败 (401)");
    throw error;
  }
};

// 新增：获取原始 Dashboard JSON 用于调试
export const getRawDashboardData = async (accessToken: string, proxyUrl: string): Promise<any> => {
    try {
        const response = await fetchWithProxy("https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613&country=cn&market=zh-CN", { 
            method: "GET", 
            headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "authorization": `Bearer ${accessToken}`, ...CN_HEADERS } 
        }, proxyUrl);
        return await response.json();
    } catch (error: any) {
        return { error: error.message };
    }
};
