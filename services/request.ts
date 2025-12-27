
import { DEFAULT_UA_MOBILE } from '../types';

export const CN_HEADERS = {
  "x-rewards-country": "cn",
  "x-rewards-language": "zh",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "x-rewards-appid": "SAAndroid/31.4.2110003555",
  "x-rewards-ismobile": "true",
  "x-rewards-partnerid": "startapp",
  "x-rewards-flights": "rwgobig",
};

// 辅助函数：检测响应中的风控关键词
export const checkRisk = (data: any, status: number) => {
  if (status === 403 || status === 429) return "请求被拒绝 (403/429)";
  
  const str = JSON.stringify(data).toLowerCase();
  if (str.includes("accountsuspended")) return "账号已被微软封禁 (Suspended)";
  if (str.includes("risk")) return "账号存在风控风险 (Risk)";
  if (str.includes("verification")) return "需要人工验证 (Verification)";
  return null;
};

// 辅助函数：处理 fetch 请求
export const fetchWithProxy = async (url: string, options: RequestInit, proxyUrl: string) => {
  let finalUrl = url;
  
  if (proxyUrl && proxyUrl.trim() !== '') {
    let normalizedProxyUrl = proxyUrl.trim();
    if (!normalizedProxyUrl.startsWith('http://') && !normalizedProxyUrl.startsWith('https://')) {
      if (normalizedProxyUrl.startsWith('localhost') || normalizedProxyUrl.startsWith('127.0.0.1')) {
         normalizedProxyUrl = `http://${normalizedProxyUrl}`;
      } else {
         normalizedProxyUrl = `https://${normalizedProxyUrl}`;
      }
    }
    if (!normalizedProxyUrl.endsWith('/')) {
      normalizedProxyUrl = `${normalizedProxyUrl}/`;
    }
    finalUrl = `${normalizedProxyUrl}${encodeURIComponent(url)}`;
  } 
  else {
    // 自动路由匹配 (Vite Proxy)
    if (url.startsWith("https://login.live.com")) {
        finalUrl = url.replace("https://login.live.com", "/api/auth");
    } else if (url.startsWith("https://prod.rewardsplatform.microsoft.com")) {
        finalUrl = url.replace("https://prod.rewardsplatform.microsoft.com", "/api/rewards");
    } else {
        console.warn("未配置代理且域名无法匹配本地路由，请求可能失败:", url);
    }
  }

  // 随机延迟模拟网络抖动
  await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); 

  const headers = new Headers(options.headers);
  // 默认 UA
  if (!headers.has("User-Agent")) {
      headers.set("User-Agent", DEFAULT_UA_MOBILE);
  }

  try {
    const response = await fetch(finalUrl, {
      ...options,
      headers: headers,
      signal: controller.signal,
      credentials: 'omit', 
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error('请求超时 (20秒)');
    throw error;
  }
};
