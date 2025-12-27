
import { WxPusherConfig } from "../types";

// WxPusher API 地址
const API_URL = "https://wxpusher.zjiecode.com/api/send/message";

// 定义发送接口需要的配置结构
export interface WxPusherSendOptions {
    enabled: boolean;
    appToken: string;
    uids: string;
}

/**
 * 发送 WxPusher 通知
 * @param config WxPusher 配置对象 (包含 appToken 和 uids)
 * @param markdownContent Markdown 格式的内容
 * @param proxyUrl 代理地址 (因为浏览器通常有跨域限制，建议走代理)
 */
export const sendNotification = async (
  config: WxPusherSendOptions | undefined,
  markdownContent: string,
  proxyUrl: string
): Promise<{ success: boolean; msg: string }> => {
  if (!config || !config.enabled || !config.appToken || !config.uids) {
    return { success: false, msg: "未配置 WxPusher 或未启用" };
  }

  // 构造请求体
  const body = {
    appToken: config.appToken,
    content: markdownContent,
    contentType: 3, // 3 代表 Markdown
    uids: config.uids.split(',').map(u => u.trim()).filter(u => u),
    summary: "MS Rewards 任务报告" // 消息摘要，显示在列表页
  };

  // 处理代理 URL
  let finalUrl = API_URL;
  let useProxy = false;
  
  if (proxyUrl && proxyUrl.trim() !== '') {
    let normalizedProxyUrl = proxyUrl.trim();
    if (!normalizedProxyUrl.startsWith('http')) {
       // 简单判断，这里假设用户填的是 IP:Port
       normalizedProxyUrl = `http://${normalizedProxyUrl}`;
    }
    if (!normalizedProxyUrl.endsWith('/')) normalizedProxyUrl += '/';
    
    // 拼接代理地址
    finalUrl = `${normalizedProxyUrl}${encodeURIComponent(API_URL)}`;
    useProxy = true;
  }

  try {
    const res = await fetch(finalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    
    if (data.code === 1000) {
      return { success: true, msg: "推送成功" };
    } else {
      return { success: false, msg: `API错误: ${data.msg || JSON.stringify(data)}` };
    }
  } catch (e: any) {
    if (!useProxy) {
        return { success: false, msg: `网络错误 (未配置代理): 浏览器无法直接访问 WxPusher API (跨域)，请在设置中填入本地代理地址。` };
    }
    return { success: false, msg: `网络错误: ${e.message}` };
  }
};
