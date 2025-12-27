
document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('copyBtn');
  const status = document.getElementById('status');

  btn.addEventListener('click', async () => {
    try {
      btn.disabled = true;
      btn.innerHTML = '正在扫描...';
      status.textContent = "正在分析当前环境...";
      status.className = "loading";

      // 1. 获取当前激活的标签页
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      if (!currentTab) {
        throw new Error("无法获取当前标签页信息");
      }

      // 检查是否在 Bing 页面
      if (!currentTab.url || (!currentTab.url.includes("bing.com") && !currentTab.url.includes("microsoft.com"))) {
          throw new Error("请先打开 Bing.com 页面再点击此按钮");
      }

      // 2. 核心修复：智能查找正确的 Cookies
      const cookies = await findCorrectCookies(currentTab);

      // 3. 构建 Map
      const cookieMap = new Map();
      if (cookies && cookies.length > 0) {
          cookies.forEach(c => {
            cookieMap.set(c.name, c.value);
          });
      }

      // 4. 检查核心凭证
      const hasAuth = cookieMap.has('_U');
      const foundNames = Array.from(cookieMap.keys()).slice(0, 8).join(', ');

      // 5. 构建 Cookie 字符串 (无论是否完整都构建)
      const cookieString = Array.from(cookieMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');

      // 6. 写入剪贴板
      await navigator.clipboard.writeText(cookieString);

      // 7. 反馈结果
      const userName = parseUserNameFromCookie(cookieMap);

      if (!hasAuth) {
         // ⚠️ 关键修改：即使没有 _U，也显示为警告而不是错误，并明确告知用户签到/阅读可用
         status.innerHTML = `<strong>⚠️ 已强制复制部分 Cookie (_U 缺失)</strong><br/>
         1. 检测到: ${foundNames || '无'}<br/>
         2. <strong>影响：</strong> 搜索任务可能无法运行。<br/>
         3. <strong>签到/阅读：</strong> <span style="color:#4ade80">完全可用</span>！(它们使用 Token)<br/>
         4. <strong>操作：</strong> 您可以直接粘贴使用，或去 cn.bing.com 重新登录。`;
         status.className = "error"; // 保持醒目的样式
         btn.innerHTML = '已强制复制 (可用作签到)';
      } else {
         status.innerHTML = `<strong>✅ 复制成功! (${currentTab.incognito ? '无痕模式' : '正常模式'})</strong><br/>已捕获 ${cookieMap.size} 个字段。<br/>用户: ${userName}`;
         status.className = "success";
         btn.innerHTML = '已复制到剪贴板';
      }

      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '再次复制';
      }, 3000);

    } catch (err) {
      console.error(err);
      status.innerText = "❌ 错误: " + err.message;
      status.className = "error";
      btn.disabled = false;
      btn.innerHTML = '重试';
    }
  });
});

/**
 * 智能查找 Cookie 策略
 */
async function findCorrectCookies(tab) {
  const stores = await chrome.cookies.getAllCookieStores();
  
  // 确定目标 Store 列表
  let targetStores = [];
  
  // A. 精确匹配
  const exactStore = stores.find(s => s.tabIds && s.tabIds.includes(tab.id));
  if (exactStore) targetStores.push(exactStore);

  // B. 根据模式推测 (无痕找非默认，正常找默认)
  const isIncognito = tab.incognito;
  const candidateStores = stores.filter(s => {
      if (isIncognito) return s.id !== "0"; 
      return s.id === "0";
  });
  targetStores = [...targetStores, ...candidateStores];

  // 去重
  targetStores = [...new Set(targetStores)];

  // 遍历 Store 寻找 _U
  for (const store of targetStores) {
      // 策略 1: 直接按名字找 _U (最准确，无视域名差异)
      const uCookie = await chrome.cookies.get({ url: "https://www.bing.com", name: "_U", storeId: store.id });
      if (uCookie) {
          return await chrome.cookies.getAll({ domain: "bing.com", storeId: store.id });
      }
      
      const cnUCookie = await chrome.cookies.get({ url: "https://cn.bing.com", name: "_U", storeId: store.id });
      if (cnUCookie) {
           return await chrome.cookies.getAll({ domain: "bing.com", storeId: store.id });
      }
      
      const cookies = await chrome.cookies.getAll({ domain: "bing.com", storeId: store.id });
      if (cookies.some(c => c.name === '_U')) return cookies;
  }

  // 如果实在找不到 _U，返回第一个找到非空 Cookie 的集合 (即使不完整，也返回供用户使用)
  for (const store of targetStores) {
      const cookies = await chrome.cookies.getAll({ domain: "bing.com", storeId: store.id });
      if (cookies.length > 0) return cookies;
  }
  
  return [];
}

function parseUserNameFromCookie(map) {
    return map.has('WLS') ? '已登录用户' : '未知用户';
}
