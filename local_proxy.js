
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer(async (req, res) => {
  // -----------------------------------------------------------------------
  // 1. CORS 处理
  // -----------------------------------------------------------------------
  const reqHeaders = req.headers['access-control-request-headers'] || '*';
  const corsHeaders = {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PROPFIND, OPTIONS, HEAD, PATCH, MKCOL', 
    'Access-Control-Allow-Headers': reqHeaders,
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': 'true' 
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // -----------------------------------------------------------------------
  // 2. 本地文件系统 API (新增 - v2.7)
  // 用于 DataManageModal 直接读写本地备份，无需手动下载
  // -----------------------------------------------------------------------
  if (req.url.startsWith('/api/local/file')) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const action = url.searchParams.get('action'); // list, read, write, delete
      const targetPath = url.searchParams.get('path') || 'backups';
      
      // 简单的安全限制，只能访问项目目录下的文件
      const safeBase = __dirname;
      const fullPath = path.resolve(safeBase, targetPath);
      
      if (!fullPath.startsWith(safeBase)) {
          res.writeHead(403, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Access Denied', msg: '只能访问项目目录下的文件' }));
          return;
      }

      try {
          if (action === 'write' && req.method === 'POST') {
              // 写入文件
              const buffers = [];
              for await (const chunk of req) { buffers.push(chunk); }
              const body = Buffer.concat(buffers).toString();
              const { filename, content } = JSON.parse(body);
              
              if (!fs.existsSync(fullPath)) {
                  fs.mkdirSync(fullPath, { recursive: true });
              }
              const filePath = path.join(fullPath, filename);
              fs.writeFileSync(filePath, content, 'utf-8');
              
              res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, path: filePath }));
              return;

          } else if (action === 'delete' && req.method === 'DELETE') {
              // 删除文件 (用于滚动备份)
              const filename = url.searchParams.get('filename');
              if (!filename) throw new Error("Filename required");
              
              const filePath = path.join(fullPath, filename);
              if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                  res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true }));
              } else {
                  res.writeHead(404, { ...corsHeaders, 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Not Found', msg: 'File does not exist' }));
              }
              return;

          } else if (action === 'list' && req.method === 'GET') {
              // 列出目录
              if (!fs.existsSync(fullPath)) {
                  fs.mkdirSync(fullPath, { recursive: true });
              }
              const files = fs.readdirSync(fullPath).filter(f => f.endsWith('.json')).map(f => ({
                  name: f,
                  mtime: fs.statSync(path.join(fullPath, f)).mtime
              })).sort((a, b) => b.mtime - a.mtime); // 按时间倒序
              
              res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, files }));
              return;

          } else if (action === 'read' && req.method === 'GET') {
              // 读取文件
              const filename = url.searchParams.get('filename');
              if (!filename) throw new Error("Filename required");
              
              const filePath = path.join(fullPath, filename);
              if (!fs.existsSync(filePath)) throw new Error("File not found");
              
              const content = fs.readFileSync(filePath, 'utf-8');
              res.writeHead(200, { ...corsHeaders, 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, content }));
              return;
          }
      } catch (e) {
          res.writeHead(500, { ...corsHeaders, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'FS Error', msg: e.message }));
          return;
      }
  }

  // -----------------------------------------------------------------------
  // 3. 代理转发逻辑 (原有)
  // -----------------------------------------------------------------------
  let targetUrlStr = req.url.substring(1); 
  
  if (!targetUrlStr.match(/^https?:\/\//i)) {
      try { targetUrlStr = decodeURIComponent(targetUrlStr); } catch (e) {}
  }

  if (!targetUrlStr.startsWith('http')) {
      if (req.url === '/' || req.url === '/favicon.ico') {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(`✅ 本地代理服务 v2.8 (Full FS Support) 运行中\n\n- API: /api/local/file?action=list|read|write|delete\n- 端口: ${PORT}`);
          return;
      }
      res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL', details: 'Target URL must start with http:// or https://' }));
      return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetUrlStr);
  } catch (err) {
    res.writeHead(400, { ...corsHeaders, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'URL Parse Error', details: err.message }));
    return;
  }

  const methodColor = req.method === 'PUT' ? '\x1b[33m' : req.method === 'POST' ? '\x1b[32m' : '\x1b[36m';
  console.log(`[Proxy] ${methodColor}${req.method}\x1b[0m -> ${targetUrl.hostname}`);

  const options = {
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host, 
      origin: targetUrl.origin,
      referer: targetUrl.origin + '/',
      'accept-encoding': 'identity', 
      'user-agent': req.headers['user-agent'] || 'MS-Rewards-Helper/2.0'
    },
    rejectUnauthorized: false
  };

  ['cookie', 'Cookie', 'host', 'origin', 'referer', 'content-length'].forEach(h => delete options.headers[h]);

  const lib = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = lib.request(targetUrl, options, (proxyRes) => {
    const resHeaders = { ...proxyRes.headers, ...corsHeaders };
    delete resHeaders['content-security-policy'];
    delete resHeaders['content-security-policy-report-only'];
    delete resHeaders['clear-site-data'];

    res.writeHead(proxyRes.statusCode, resHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error] ${err.message}`);
    if (!res.headersSent) {
        res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy Connection Failed', message: err.message }));
    }
  });

  proxyReq.setTimeout(30000, () => proxyReq.destroy());
  req.pipe(proxyReq);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================');
  console.log(`✅ 本地代理服务 v2.8 (Full FS Support) 已启动!`);
  console.log(`📂 默认备份路径: ./backups/`);
  console.log(`📡 监听地址: http://127.0.0.1:${PORT}`);
  console.log('================================================');
});
