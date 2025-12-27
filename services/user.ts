
import { AccountStats } from '../types';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 辅助函数：安全获取属性（忽略大小写）
const getAttr = (obj: any, key: string): any => {
    if (!obj || typeof obj !== 'object') return undefined;
    const lowerKey = key.toLowerCase();
    for (const k in obj) {
        if (k.toLowerCase() === lowerKey) return obj[k];
    }
    return undefined;
};

// 获取 dashboard 数据 (包含积分、任务状态等)
export const getDashboardData = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ 
    totalPoints: number, 
    stats: AccountStats 
}> => {
  try {
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
    
    // 兼容性处理
    const appResponse = appDataRaw?.response || appDataRaw || {};
    const totalPoints = appResponse.balance ?? 0;

    let stats: AccountStats = {
        readProgress: 0, 
        readMax: 30,
        pcSearchProgress: 0,
        pcSearchMax: 0,
        mobileSearchProgress: 0,
        mobileSearchMax: 0,
        checkInProgress: 0,
        checkInMax: 0,
        redeemGoal: undefined,
        dailySetProgress: 0,
        dailySetMax: 0,
        morePromosProgress: 0, 
        morePromosMax: 0,
        dailyActivitiesProgress: 0, // 新增
        dailyActivitiesMax: 0 // 新增
    };

    console.groupCollapsed(`📊 Dashboard Data Debug [${new Date().toLocaleTimeString()}]`);
    
    // --- 目标提取逻辑 ---
    let rawGoal = appResponse['goal_item'] || appResponse['redeemGoal'] || getAttr(appResponse, 'goal_item');
    if (!rawGoal) {
        const autoItem = appResponse['autoRedeemItem'] || getAttr(appResponse, 'autoRedeemItem');
        if (autoItem) {
            console.log("🕵️‍♂️ Found autoRedeemItem, using as goal candidate.");
            rawGoal = autoItem;
        }
    }
    if (!rawGoal) {
        const profile = appResponse['profile'] || getAttr(appResponse, 'profile');
        if (profile) {
             const userStatus = getAttr(profile, 'userStatus') || getAttr(profile, 'user_status');
             if (userStatus) {
                 rawGoal = getAttr(userStatus, 'goal_item') || getAttr(userStatus, 'redeemGoal');
             }
        }
    }
    if (!rawGoal) {
        const userStatus = getAttr(appResponse, 'userStatus') || getAttr(appResponse, 'user_status');
        if (userStatus) {
            rawGoal = getAttr(userStatus, 'goal_item') || getAttr(userStatus, 'redeemGoal');
        }
    }

    if (rawGoal) {
        const title = getAttr(rawGoal, 'title') || getAttr(rawGoal, 'name') || getAttr(rawGoal, 'description') || getAttr(rawGoal, 'display_name');
        const priceRaw = getAttr(rawGoal, 'price') || getAttr(rawGoal, 'points') || getAttr(rawGoal, 'amount') || getAttr(rawGoal, 'promotionPrice') || getAttr(rawGoal, 'value');
        const imageUrl = getAttr(rawGoal, 'imageUrl') || getAttr(rawGoal, 'image_url') || getAttr(rawGoal, 'image') || getAttr(rawGoal, 'blobImage');

        let finalPrice = 0;
        if (priceRaw) {
            if (typeof priceRaw === 'string') {
                finalPrice = Number(priceRaw.replace(/[^0-9]/g, ''));
            } else {
                finalPrice = Number(priceRaw);
            }
        }

        if (title) {
            stats.redeemGoal = {
                title: String(title),
                price: finalPrice || 0,
                imageUrl: imageUrl
            };
            console.log(`✅ [Goal Extracted] ${stats.redeemGoal.title}`);
        }
    } 

    // --- 任务进度提取 ---
    const dashboard = appResponse.dashboard || appResponse; 
    
    // A. 每日活动 (Daily Set) - 保留逻辑，用于状态条展示
    const dailySetPromotions = dashboard.dailySetPromotions || {};
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    
    const keysToTry = [
        `${month}/${day}/${year}`,
        `${now.getMonth() + 1}/${now.getDate()}/${year}`
    ];
    
    let dailyTasks: any[] = [];
    for (const k of keysToTry) {
        if (dailySetPromotions[k]) {
            dailyTasks = dailySetPromotions[k];
            break;
        }
    }
    
    if (dailyTasks && Array.isArray(dailyTasks) && dailyTasks.length > 0) {
        stats.dailySetMax = dailyTasks.length;
        stats.dailySetProgress = dailyTasks.filter((t: any) => t.complete === true).length;
        console.log(`📅 Daily Set (Web): ${stats.dailySetProgress}/${stats.dailySetMax}`);
    }

    // B. 移动端任务列表 (promotions)
    const pro = appResponse.promotions || [];
    
    if (pro && Array.isArray(pro)) {
      for (const o of pro) {
        const attributes = o.attributes || {};
        const offerId = (getAttr(attributes, 'offerid') || "").toLowerCase();
        const contentClass = (getAttr(attributes, 'contentclass') || "").toLowerCase();
        const title = (getAttr(attributes, 'title') || "").toLowerCase();
        
        // 积分值提取
        const progress = Number(getAttr(attributes, 'progress') || 0);
        const max = Number(getAttr(attributes, 'max') || 0);

        if (max > 0) {
             console.log(`[Task] ${title} (${offerId}): ${progress}/${max}`);
        }

        // 1. 阅读
        const isReadTask = 
            offerId === "enus_readarticle3_30points" || 
            title.includes("read to earn") || 
            title.includes("read and you shall be rewarded") ||
            title.includes("阅读");

        if (isReadTask) {
          stats.readMax = max > 0 ? max : 30;
          stats.readProgress = progress;
        }

        // 2. PC 搜索
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
        
        // 3. 移动搜索
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

        // 4. Sapphire 每日签到
        const isPuzzle = offerId.includes("puzzle") || title.includes("puzzle") || title.includes("拼图");
        const isRealCheckIn = 
            (offerId.includes("dailycheckin") && !isPuzzle) || 
            (title.includes("daily check-in") && !isPuzzle) ||
            offerId.includes("gamification_sapphire_dailycheckin"); 
        
        if (isRealCheckIn) {
            stats.checkInMax = max;
            stats.checkInProgress = progress;
            console.log(`✅ Identified Sapphire Check-in: ${offerId}`);
        }

        // 5. 每日活动 (Daily Activities / Global Offers)
        // 特征: zhstar_rewards_dailyglobaloffer_evergreen_...
        const isDailyActivity = 
            offerId.includes("dailyglobaloffer") ||
            offerId.includes("daily_activity") ||
            title.includes("每日活动") ||
            title.includes("daily set");
        
        if (isDailyActivity && !isPCSearch && !isMobileSearch && !isReadTask && !isRealCheckIn) {
            if (max > 0) {
                // 累加多个每日活动的积分
                stats.dailyActivitiesMax = (stats.dailyActivitiesMax || 0) + max;
                stats.dailyActivitiesProgress = (stats.dailyActivitiesProgress || 0) + progress;
            }
        }
      }
    }
    console.groupEnd();

    return { totalPoints, stats };

  } catch (error: any) {
    if (error.message && error.message.includes('401')) throw new Error("鉴权失败 (401)");
    throw error;
  }
};
