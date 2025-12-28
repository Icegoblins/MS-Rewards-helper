
import { getRandomUUID } from '../utils/helpers';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 获取今日日期的数字格式 (YYYYMMDD)
const getTodayDateNum = (): number => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return parseInt(`${year}${month}${day}`);
};

// ----------------------------------------------------------------
// 子任务 A: 通用移动端签到 (Type 103)
// ----------------------------------------------------------------
const signType103 = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean): Promise<{ points: number; msg: string; success: boolean }> => {
    try {
        const response = await fetchWithProxy(
            "https://prod.rewardsplatform.microsoft.com/dapi/me/activities", 
            { 
                method: "POST", 
                headers: { 
                    "content-type": "application/json; charset=UTF-8", 
                    "authorization": `Bearer ${accessToken}`, 
                    ...CN_HEADERS 
                }, 
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
        
        if (earned > 0) return { points: earned, msg: `通用签到+${earned}`, success: true };
        return { points: 0, msg: "通用已签", success: true };
    } catch (e: any) {
        return { points: 0, msg: `通用异常`, success: false };
    }
};

// ----------------------------------------------------------------
// 子任务 B: Sapphire APP 签到 (Type 101) - Python 脚本逻辑
// ----------------------------------------------------------------
const signSapphire = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean): Promise<{ points: number; msg: string; success: boolean }> => {
    try {
        // 构造 Python 脚本中的特定 Payload
        const payload = {
            "amount": 1,
            "attributes": {
                "offerid": "Gamification_Sapphire_DailyCheckIn",
                "date": getTodayDateNum(), // YYYYMMDD
                "signIn": false,
                "timezoneOffset": "480" // 模拟 Python 脚本中的时区偏移
            },
            "id": getRandomUUID(),
            "type": 101, // Sapphire 使用 101
            "country": "cn",
            "risk_context": {},
            "channel": "SAAndroid"
        };

        const response = await fetchWithProxy(
            "https://prod.rewardsplatform.microsoft.com/dapi/me/activities", 
            { 
                method: "POST", 
                headers: { 
                    "content-type": "application/json; charset=UTF-8", 
                    "authorization": `Bearer ${accessToken}`, 
                    ...CN_HEADERS 
                }, 
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

        if (data.error) {
            // 处理 "Duplicate" 或 "Already" 错误，视为成功
            const errDesc = data.error.description || data.message || "";
            if (errDesc.toLowerCase().includes("duplicate") || errDesc.toLowerCase().includes("already")) {
                return { points: 0, msg: "Sapphire已签", success: true };
            }
            return { points: 0, msg: `Sapphire错误: ${errDesc}`, success: false };
        }

        let earned = 0;
        if (data?.response?.activity?.p) earned = Number(data.response.activity.p);

        if (earned > 0) return { points: earned, msg: `Sapphire签到+${earned}`, success: true };
        return { points: 0, msg: "Sapphire无分", success: true };

    } catch (e: any) {
        return { points: 0, msg: `Sapphire异常`, success: false };
    }
};

// ----------------------------------------------------------------
// 主入口：执行双重签到
// ----------------------------------------------------------------
export const taskSign = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; points: number; message: string }> => {
  try {
    // 1. 执行通用签到 (Type 103)
    const res1 = await signType103(accessToken, proxyUrl, ignoreRisk);
    
    // 随机延迟 1-2 秒，避免并发冲突
    await new Promise(r => setTimeout(r, 1500));

    // 2. 执行 Sapphire 签到 (Type 101)
    const res2 = await signSapphire(accessToken, proxyUrl, ignoreRisk);

    // 汇总结果
    const totalPoints = res1.points + res2.points;
    const isSuccess = res1.success || res2.success; // 只要有一个成功就算成功
    
    // 构造合并消息
    let finalMsg = "";
    
    // 情况 A: 只要有积分入账
    if (res1.points > 0 || res2.points > 0) {
        finalMsg = `双重签到: +${totalPoints} (通用:+${res1.points}, Sapphire:+${res2.points})`;
    } 
    // 情况 B: 两者都已签到
    else if (res1.msg.includes("已签") && res2.msg.includes("已签")) {
        finalMsg = "今日双重签到已完成 (通用 & Sapphire)";
    } 
    // 情况 C: 混合状态（可能是错误、无分等）
    else {
        // 简化显示：如果一个是“已签”，另一个是“错误”，则显示具体情况
        const msg1 = res1.points > 0 ? `+${res1.points}` : res1.msg;
        const msg2 = res2.points > 0 ? `+${res2.points}` : res2.msg;
        finalMsg = `双重检测: [通用] ${msg1} | [Sapphire] ${msg2}`;
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
