
import React, { useState } from 'react';

interface ProxyGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProxyGuideModal: React.FC<ProxyGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'local' | 'cloudflare'>('local');

  if (!isOpen) return null;

  const localProxyCode = `// 确保项目根目录下有 local_proxy.js 文件
// 1. 打开一个新的终端窗口
// 2. 运行命令:
node local_proxy.js

// 3. 看到 "监听端口: 3001" 即表示成功`;

  const workerCode = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "*",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }
    // 解析目标 URL
    let targetUrlStr = url.pathname.substring(1) + url.search;
    try { 
      if (!targetUrlStr.startsWith('http')) targetUrlStr = decodeURIComponent(targetUrlStr); 
    } catch {}
    
    if (!targetUrlStr.startsWith("http")) return new Response("Invalid URL", { status: 400 });

    const targetUrl = new URL(targetUrlStr);
    const newHeaders = new Headers(request.headers);
    newHeaders.set("Host", targetUrl.host);
    newHeaders.set("Origin", targetUrl.origin);
    newHeaders.set("Referer", targetUrl.origin + '/');
    
    // 移除 Cloudflare 特征头
    ["cf-connecting-ip","cf-ipcountry","cf-ray","cf-visitor"].forEach(h => newHeaders.delete(h));

    try {
      const response = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.body,
        redirect: "follow"
      });
      
      const newResHeaders = new Headers(response.headers);
      newResHeaders.set("Access-Control-Allow-Origin", "*");
      return new Response(response.body, {
        status: response.status,
        headers: newResHeaders
      });
    } catch (e) {
      return new Response(e.message, { status: 502 });
    }
  },
};`;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">高级代理设置指南</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'local' 
                ? 'border-blue-500 text-blue-400 bg-gray-700/50' 
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            方案 A: 本地 Node 代理 (推荐 - 中国IP)
          </button>
          <button
            onClick={() => setActiveTab('cloudflare')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'cloudflare' 
                ? 'border-orange-500 text-orange-400 bg-gray-700/50' 
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            方案 B: Cloudflare Worker (海外IP)
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {activeTab === 'local' ? (
            <div className="space-y-4">
              <div className="bg-green-900/30 border border-green-800 rounded p-3 text-sm text-green-300">
                <strong>✅ 优点：</strong> 能够完美获取 Token，且完全保留您的<b>本机 IP (中国)</b>，不会导致积分跨区或封号。
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white">第一步：启动代理服务</h4>
                <p className="text-sm text-gray-400">在项目根目录下，我已经为您准备了 <code className="bg-gray-700 px-1 rounded">local_proxy.js</code> 文件。</p>
                <div className="bg-gray-950 rounded p-3 font-mono text-xs text-gray-300 relative group border border-gray-700">
                  <pre>{localProxyCode}</pre>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white">第二步：配置网页</h4>
                <p className="text-sm text-gray-400">
                  服务启动后，在网页的“全局设置 &rarr; 代理设置”框中填入：
                </p>
                <div className="bg-black border border-gray-600 rounded p-2 text-green-400 font-mono text-center select-all">
                  http://localhost:3001
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-orange-900/30 border border-orange-800 rounded p-3 text-sm text-orange-300">
                <strong>⚠️ 警告：</strong> Cloudflare 节点通常位于美国。微软会认为您正在美国访问，这将导致积分变成美元区，无法兑换中国区奖品，并可能标记为风险账号。
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-white">部署步骤</h4>
                <ol className="list-decimal list-inside text-sm text-gray-400 space-y-1">
                  <li>登录 <a href="https://dash.cloudflare.com/" target="_blank" className="text-blue-400 underline">Cloudflare Dashboard</a></li>
                  <li>进入 <b>Workers & Pages</b> &gt; <b>Create Worker</b></li>
                  <li>点击 <b>Edit Code</b>，粘贴下方代码并覆盖原有内容</li>
                  <li>点击 <b>Deploy</b>，复制获得的 URL (例如 xxx.workers.dev)</li>
                </ol>
                <div className="bg-gray-950 rounded p-3 font-mono text-xs text-gray-300 h-40 overflow-y-auto border border-gray-700">
                  <pre>{workerCode}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 flex justify-end">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProxyGuideModal;
