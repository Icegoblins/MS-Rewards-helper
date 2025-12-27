
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';

// 强制使用 IPv4
try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  console.warn('Node version < 17, skipping dns.setDefaultResultOrder');
}

// 创建 Keep-Alive Agent，防止连接挂起
const agentOptions = { keepAlive: true, keepAliveMsecs: 20000 };
const httpAgent = new http.Agent(agentOptions);
const httpsAgent = new https.Agent(agentOptions);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', 
    port: 5173,
    proxy: {
      '/api/auth': {
        target: 'https://login.live.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth/, ''),
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000,
        agent: httpsAgent, 
        headers: { 'Connection': 'keep-alive' },
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`[Proxy Auth] > ${req.url}`);
            proxyReq.setHeader('Origin', 'https://login.live.com');
          });
        }
      },
      '/api/rewards': {
        target: 'https://prod.rewardsplatform.microsoft.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/rewards/, ''),
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000,
        agent: httpsAgent,
        headers: { 'Connection': 'keep-alive' },
        configure: (proxy, options) => {
           proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`[Proxy Rewards] > ${req.url}`);
            proxyReq.setHeader('Origin', 'https://prod.rewardsplatform.microsoft.com');
          });
        }
      },
      // Web Dashboard 代理
      '/api/bing': {
        target: 'https://rewards.bing.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bing/, ''),
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000,
        agent: httpsAgent,
        headers: { 'Connection': 'keep-alive' },
        configure: (proxy, options) => {
           proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`[Proxy WebDashboard] > ${req.url}`);
            proxyReq.setHeader('Origin', 'https://rewards.bing.com');
            proxyReq.setHeader('Referer', 'https://rewards.bing.com/');
          });
        }
      },
       // Bing Search 代理
      '/api/www': {
        target: 'https://www.bing.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/www/, ''),
        secure: false,
        timeout: 10000,
        proxyTimeout: 10000,
        agent: httpsAgent,
        headers: { 'Connection': 'keep-alive' },
        configure: (proxy, options) => {
           proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`[Proxy Search] > ${req.url}`);
            proxyReq.setHeader('Origin', 'https://www.bing.com');
            proxyReq.setHeader('Referer', 'https://www.bing.com/');
          });
        }
      }
    }
  }
});
