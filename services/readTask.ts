
import { DEFAULT_UA_MOBILE } from '../types';
import { fetchWithProxy, checkRisk, CN_HEADERS } from './request';

// 生成 64 字符的十六进制字符串 (模仿 Python secrets.token_hex(32))
const genHexId = (): string => {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
};

// 阅读任务模块
export const taskRead = async (accessToken: string, proxyUrl: string, ignoreRisk: boolean = false): Promise<{ success: boolean; message: string }> => {
  try {
    // URL 清理：去除查询参数
    const url = "https://prod.rewardsplatform.microsoft.com/dapi/me/activities";
    
    // 构造 Headers
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "User-Agent": DEFAULT_UA_MOBILE,
        "Accept-Encoding": "gzip",
        ...CN_HEADERS 
    };

    const payload = {
        "amount": 1,
        "country": "cn",
        "id": genHexId(), // 64 char hex string for reading
        "type": 101,
        "attributes": { 
            "offerid": "ENUS_readarticle3_30points",
            "timezoneOffset": "08:00:00" // 补充时区信息
        }
    };

    const response = await fetchWithProxy(
        url, 
        { 
            method: "POST", 
            headers: headers, 
            body: JSON.stringify(payload) 
        }, 
        proxyUrl
    );
    
    try {
        const cloned = response.clone();
        const data = await cloned.json();
        
        // 检查是否已完成 (Duplicate)
        if (data.error && (data.error.description || "").toLowerCase().includes("already")) {
             return { success: true, message: "阅读已完成" };
        }

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
