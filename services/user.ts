
import { AccountStats } from '../types';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 辅助函数：安全获取属性（忽略大小写，支持深度查找）
const getAttr = (obj: any, key: string): any => {
    if (!obj || typeof obj !== 'object') return undefined;
    const lowerKey = key.toLowerCase();
    for (const k in obj) {
        if (k.toLowerCase() === lowerKey) return obj[k];
    }
    return undefined;
};

// 获取极简数据 (只关心总分和阅读进度)
export const getDashboardData = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ 
    totalPoints: number, 
    stats: AccountStats 
}> => {
  try {
    // 移除 options=613，获取全量 Dashboard 数据，确保包含 redeemGoal
    const response = await fetchWithProxy("https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&country=cn&market=zh-CN", { 
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

    let stats: AccountStats = {
        readProgress: 0, 
        readMax: 30,
        pcSearchProgress: 0,
        pcSearchMax: 0,
        mobileSearchProgress: 0,
        mobileSearchMax: 0,
        redeemGoal: undefined
    };

    // Debug Log: 帮助用户排查数据 (折叠显示)
    console.groupCollapsed(`📊 Dashboard Data Debug [${new Date().toLocaleTimeString()}]`);
    console.log("Raw Response Keys:", Object.keys(appResponse)); // 打印根节点所有 Key

    // --- 增强的目标提取逻辑 ---
    // 1. 尝试直接获取 (新增 goal_item)
    let rawGoal = getAttr(appResponse, 'redeemGoal') || getAttr(appResponse, 'redeem_goal') || getAttr(appResponse, 'goal') || getAttr(appResponse, 'goal_item');
    
    // 2. 如果没找到，尝试在 userStatus 中查找 (某些旧版接口结构)
    if (!rawGoal) {
        const userStatus = getAttr(appResponse, 'userStatus');
        if (userStatus) {
            console.log("Searching in userStatus...");
            rawGoal = getAttr(userStatus, 'redeemGoal') || getAttr(userStatus, 'redeem_goal') || getAttr(userStatus, 'goal_item');
        }
    }

    if (rawGoal) {
        // 打印 goal 对象的内容，方便确认内部结构
        console.log("👉 Raw Goal Object Found:", rawGoal);

        // 提取内部字段，同样使用 getAttr 忽略大小写
        const title = getAttr(rawGoal, 'title');
        const price = getAttr(rawGoal, 'price');
        const imageUrl = getAttr(rawGoal, 'imageUrl') || getAttr(rawGoal, 'image_url') || getAttr(rawGoal, 'image');

        if (title && price) {
            stats.redeemGoal = {
                title: String(title),
                price: Number(price),
                imageUrl: imageUrl
            };
            console.log(`✅ [Goal Found] Title: ${stats.redeemGoal.title}, Price: ${stats.redeemGoal.price}`);
        } else {
            console.warn("⚠️ [Goal Warning] Found goal object but missing title/price keys.");
        }
    } else {
        console.warn("❌ [Goal Missing] Could not find 'redeemGoal' or 'goal_item' object in API response.");
    }

    const pro = appResponse.promotions;
    
    if (pro && Array.isArray(pro)) {
      for (const o of pro) {
        const attributes = o.attributes || {};
        
        // 兼容不同大小写的 key
        const offerId = (getAttr(attributes, 'offerid') || "").toLowerCase();
        const contentClass = (getAttr(attributes, 'contentclass') || "").toLowerCase();
        const title = (getAttr(attributes, 'title') || "").toLowerCase();
        
        // 尝试获取进度和最大值
        const progress = Number(getAttr(attributes, 'progress') || 0);
        const max = Number(getAttr(attributes, 'max') || 0);

        // 打印每个 Promotion 的关键信息，方便调试
        if (max > 0) { // 只打印有分数的任务
            console.log(`[Task] ${title} (${offerId}): ${progress}/${max}`);
        }

        // 1. 阅读任务
        if (offerId === "enus_readarticle3_30points" || title.includes("read to earn")) {
          stats.readMax = max > 0 ? max : 30;
          stats.readProgress = progress;
        }

        // 2. PC 搜索任务
        const isPCSearch = 
            contentClass.includes("pc_search") || 
            offerId.includes("pcsearch") ||
            (offerId.includes("search") && offerId.includes("pc") && !offerId.includes("mobile")) ||
            title.includes("电脑搜索") ||
            title.includes("pc search");

        if (isPCSearch && !offerId.includes("edge")) {
             if (max > 0) {
                 stats.pcSearchMax = max;
                 stats.pcSearchProgress = progress;
             }
        }
        
        // 3. 移动端搜索任务
        const isMobileSearch = 
            contentClass.includes("mobile_search") || 
            offerId.includes("mobilesearch") || 
            offerId.includes("urlreward") ||
            (offerId.includes("search") && offerId.includes("mobile")) ||
            title.includes("移动") ||
            title.includes("mobile search");

        if (isMobileSearch) {
             if (max > 0) {
                 stats.mobileSearchMax = max;
                 stats.mobileSearchProgress = progress;
             }
        }
      }
    } else {
        console.warn("No promotions array found in API response");
    }
    console.groupEnd();

    return { totalPoints, stats };

  } catch (error: any) {
    if (error.message && error.message.includes('401')) throw new Error("鉴权失败 (401)");
    throw error;
  }
};
