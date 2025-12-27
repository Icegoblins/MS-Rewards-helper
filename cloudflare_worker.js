// 这是一个 Cloudflare Worker 脚本
// 它可以作为 CORS 代理，转发请求到微软服务器
// 部署方法：
// 1. 登录 Cloudflare 控制台 -> Workers & Pages -> Create Application -> Create Worker
// 2. 命名你的 Worker (例如 ms-rewards-proxy) -> Deploy
// 3. 点击 "Edit code"，将本文件内容完全覆盖原有代码 -> Save and deploy
// 4. 复制你的 Worker URL (例如 https://ms-rewards-proxy.username.workers.dev) 到本应用的设置中

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. 处理 CORS 预检请求 (OPTIONS)
    // 浏览器在发送复杂请求前会先发送 OPTIONS 请求询问权限
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "*", // 允许所有 Header
        },
      });
    }

    // 2. 解析目标 URL
    // 客户端发送的格式通常是: https://worker.dev/https%3A%2F%2Ftarget.com%2Fapi
    // url.pathname 包含了 /https%3A%2F%2F...
    let targetUrlStr = url.pathname.substring(1) + url.search;
    
    if (!targetUrlStr) {
      return new Response("Proxy usage: https://your-worker.dev/https%3A%2F%2Ftarget.com", { status: 400 });
    }

    // 尝试解码 URL
    try {
      // 如果客户端发送的是编码后的 URL，需要解码
      if (targetUrlStr.startsWith('http')) {
         // 已经是 http 开头，可能是客户端没编码或者 worker 自动处理了一部分，
         // 但通常 url.pathname 在 worker 环境是解码后的还是原始的取决于具体环境，
         // 这里的逻辑兼容两种情况。
      } else {
        targetUrlStr = decodeURIComponent(targetUrlStr);
      }
    } catch (e) {
      // 解码失败则尝试直接使用
    }

    // 简单的协议校验
    if (!targetUrlStr.startsWith("http")) {
       return new Response("Invalid Target URL. Must start with http/https.", { status: 400 });
    }

    // 3. 构建发往目标服务器的新请求
    const targetUrl = new URL(targetUrlStr);
    const newRequestHeaders = new Headers(request.headers);
    
    // 修改关键头部，伪装成直接访问
    newRequestHeaders.set("Host", targetUrl.host);
    newRequestHeaders.set("Origin", targetUrl.origin);
    newRequestHeaders.set("Referer", targetUrl.href);
    
    // 移除 Cloudflare 特有的头部，避免被目标服务器识别或拒绝
    const headersToDelete = [
      "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor", "x-forwarded-proto", "x-real-ip"
    ];
    headersToDelete.forEach(h => newRequestHeaders.delete(h));

    // 创建新请求对象
    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: newRequestHeaders,
      body: request.body,
      redirect: "follow"
    });

    // 4. 发起请求
    let response;
    try {
      response = await fetch(newRequest);
    } catch (e) {
      return new Response(`Proxy Error: ${e.message}`, { status: 502 });
    }

    // 5. 处理响应，附加 CORS 头部
    const newResponseHeaders = new Headers(response.headers);
    newResponseHeaders.set("Access-Control-Allow-Origin", "*");
    newResponseHeaders.set("Access-Control-Expose-Headers", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newResponseHeaders,
    });
  },
};