
import { fetchWithProxy } from './request';

// 1. 获取 Token
export const exchangeCodeForToken = async (code: string, proxyUrl: string): Promise<{ refreshToken: string, accessToken: string, expiresIn: number }> => {
  try {
    const url = "https://login.live.com/oauth20_token.srf";
    const scope = "service::prod.rewardsplatform.microsoft.com::MBI_SSL offline_access openid profile";
    const body = new URLSearchParams({ client_id: "0000000040170455", code: code, grant_type: "authorization_code", redirect_uri: "https://login.live.com/oauth20_desktop.srf", scope: scope });
    const response = await fetchWithProxy(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }, proxyUrl);
    
    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Token 返回异常格式 ${response.status} (非 JSON)`);
    }

    if (data.refresh_token && data.access_token) {
        console.log(`[Token Exchange] Expires in: ${data.expires_in}s`);
        return { refreshToken: data.refresh_token, accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
    }
    else throw new Error(data.error_description || `未知错误: ${JSON.stringify(data)}`);
  } catch (error) { console.error('Exchange token failed:', error); throw error; }
};

// 2. 刷新 Token
export const renewToken = async (refreshToken: string, proxyUrl: string): Promise<{ accessToken: string; newRefreshToken: string, expiresIn: number }> => {
  try {
    const url = "https://login.live.com/oauth20_token.srf";
    const body = new URLSearchParams({ client_id: "0000000040170455", refresh_token: refreshToken, grant_type: "refresh_token", redirect_uri: "https://login.live.com/oauth20_desktop.srf", scope: "service::prod.rewardsplatform.microsoft.com::MBI_SSL offline_access openid profile" });
    const response = await fetchWithProxy(url, { method: 'POST', headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }, proxyUrl);
    
    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`刷新 Token 失败，服务器返回非 JSON 格式 (Status: ${response.status})`);
    }

    if (data.error) {
        throw new Error(`刷新 Token 拒绝: ${data.error_description || data.error} (请重新登录)`);
    }

    if (data.access_token && data.refresh_token) {
        console.log(`[Token Renew] Expires in: ${data.expires_in}s`);
        return { accessToken: data.access_token, newRefreshToken: data.refresh_token, expiresIn: data.expires_in || 3600 };
    }
    
    throw new Error(`刷新响应缺失关键字段: ${JSON.stringify(data)}`);
  } catch (error: any) { 
      if (error.message.includes("重新登录") || error.message.includes("invalid_grant")) {
          throw new Error("Token 已失效/被拒绝，请重新添加账号");
      }
      throw error; 
  }
};
