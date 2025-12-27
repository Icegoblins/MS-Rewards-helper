
import React, { useState, useEffect } from 'react';
import { AppConfig, Account, SystemLog, WebDAVConfig } from '../types';
import CronGeneratorModal from './CronGeneratorModal';
import ToggleSwitch from './ToggleSwitch';

interface WebDAVModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  accounts: Account[];
  onUpdateConfig: (key: keyof AppConfig, value: WebDAVConfig | undefined) => void;
  onImportAccounts: (accounts: Account[], config?: AppConfig, systemLogs?: SystemLog[]) => void;
  addSystemLog: (msg: string, type: 'info'|'success'|'error', source?: string) => void;
}

const WebDAVModal: React.FC<WebDAVModalProps> = ({ isOpen, onClose, config, accounts, onUpdateConfig, onImportAccounts, addSystemLog }) => {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [backupPath, setBackupPath] = useState('MS_Rewards_Backups'); 
  const [autoSync, setAutoSync] = useState(false);
  const [cronExpression, setCronExpression] = useState('0 2 * * *');
  
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCronGenerator, setShowCronGenerator] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'nutstore' | 'infinicloud'>('nutstore');

  const [restoreData, setRestoreData] = useState<any>(null);
  const [isConfirmingRestore, setIsConfirmingRestore] = useState(false);

  useEffect(() => {
    if (isOpen) {
        setActiveTab('nutstore');
        loadConfigForTab('nutstore');
        setStatus('');
        setIsConfirmingRestore(false);
    }
  }, [isOpen]); 

  useEffect(() => {
      if (isOpen) {
          loadConfigForTab(activeTab);
      }
  }, [activeTab]);

  const loadConfigForTab = (tab: 'nutstore' | 'infinicloud') => {
      const targetConfig = config[tab];
      
      if (targetConfig) {
          setUrl(targetConfig.url || '');
          setUsername(targetConfig.username || '');
          setPassword(targetConfig.password || '');
          setBackupPath(targetConfig.backupPath || 'MS_Rewards_Backups');
          setAutoSync(targetConfig.autoSync || false);
          setCronExpression(targetConfig.cronExpression || '0 2 * * *');
      } else {
          if (tab === 'nutstore') {
              setUrl('https://dav.jianguoyun.com/dav/');
              setCronExpression('0 2 * * *'); 
          } else if (tab === 'infinicloud') {
              setUrl('https://kamo.teracloud.jp/dav/'); 
              setCronExpression('30 2 * * *'); 
          }
          setUsername('');
          setPassword('');
          setBackupPath('MS_Rewards_Backups');
          setAutoSync(false);
      }
      setStatus('');
      setIsConfirmingRestore(false);
      setRestoreData(null);
  };

  if (!isOpen) return null;

  const fetchThroughProxy = async (targetUrl: string, method: string, body?: string) => {
      let proxyBase = config.proxyUrl.trim();
      if (proxyBase.endsWith('/')) proxyBase = proxyBase.slice(0, -1);
      
      const fullUrl = `${proxyBase}/${encodeURIComponent(targetUrl)}`;
      const headers: any = {
          'Authorization': 'Basic ' + btoa(username + ':' + password),
      };
      if (body) headers['Content-Type'] = 'application/json';

      try {
        const response = await fetch(fullUrl, { method, headers, body, credentials: 'omit' });
        return response;
      } catch (e: any) {
          throw new Error(`连接失败，请检查本地代理`);
      }
  };

  const getProviderName = () => {
      return activeTab === 'nutstore' ? '坚果云' : 'InfiniCloud';
  };

  const ensureRemotePath = async (baseUrl: string, folderPath: string) => {
      if (!folderPath) return true;
      const parts = folderPath.split('/').filter(p => p && p !== '.');
      let currentUrl = baseUrl;
      if (!currentUrl.endsWith('/')) currentUrl += '/';

      for (const part of parts) {
          currentUrl += part + '/';
          try {
              const res = await fetchThroughProxy(currentUrl, 'MKCOL');
          } catch (e) { 
          }
      }
      return true;
  };

  const handleSave = () => {
    const data: WebDAVConfig = { 
        url: url.trim(), 
        username, 
        password, 
        backupPath: backupPath.trim(), 
        autoSync, 
        cronExpression,
        lastSyncTime: config[activeTab]?.lastSyncTime 
    };
    
    onUpdateConfig(activeTab, data);
    setStatus(`已保存 [${getProviderName()}] 配置`);
  };

  const getFullFileUrl = () => {
      let baseUrl = url.trim();
      if (!baseUrl.endsWith('/')) baseUrl += '/';
      
      let path = backupPath.trim();
      if (path.startsWith('/')) path = path.substring(1);
      if (!path.endsWith('/')) path += '/';
      
      return `${baseUrl}${path}ms_rewards_backup.json`;
  };

  const handleUpload = async () => {
    if (!url) return setStatus('请先填写 WebDAV 地址');
    setIsLoading(true);
    setStatus('正在打包...');
    
    try {
      const currentTabConfig: WebDAVConfig = {
          url: url.trim(), 
          username, 
          password, 
          backupPath: backupPath.trim(), 
          autoSync, 
          cronExpression,
          lastSyncTime: config[activeTab]?.lastSyncTime 
      };

      const configToExport = {
          ...config,
          [activeTab]: currentTabConfig
      };

      const data = JSON.stringify({ accounts, config: configToExport, exportDate: new Date().toISOString(), version: "2.1.0" }, null, 2);

      setStatus('检查目录结构...');
      const baseUrl = url.trim();
      await ensureRemotePath(baseUrl, backupPath);

      setStatus('正在上传...');
      const targetUrl = getFullFileUrl();
      const response = await fetchThroughProxy(targetUrl, 'PUT', data);

      if (response.ok || response.status === 201 || response.status === 204) {
        setStatus(`✅ 上传成功! (${new Date().toLocaleTimeString()})`);
        addSystemLog(`${getProviderName()} 备份上传成功`, 'success', 'WebDAV');
        
        onUpdateConfig(activeTab, { ...currentTabConfig, lastSyncTime: Date.now() });

      } else {
        let errMsg = `HTTP ${response.status}`;
        if (response.status === 401) errMsg = "401 鉴权失败 (检查应用密码)";
        setStatus(`❌ 上传失败: ${errMsg}`);
        addSystemLog(`${getProviderName()} 上传失败: ${errMsg}`, 'error', 'WebDAV');
      }
    } catch (e: any) {
      setStatus(`❌ 错误: ${e.message}`);
      addSystemLog(`${getProviderName()} 上传异常: ${e.message}`, 'error', 'WebDAV');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckDownload = async () => {
    if (!url) return setStatus('请先填写 WebDAV 地址');
    setIsLoading(true);
    setStatus('正在连接云端...');
    
    try {
      const targetUrl = getFullFileUrl();
      const response = await fetchThroughProxy(targetUrl, 'GET');
      
      if (response.status === 404) throw new Error("未找到备份文件");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const json = await response.json();
      if (json.accounts) {
          setRestoreData(json);
          setIsConfirmingRestore(true); 
          setStatus('✅ 发现云端备份，请确认覆盖');
      } else {
          throw new Error("文件格式错误");
      }
    } catch (e: any) {
        setStatus(`❌ ${e.message}`);
        addSystemLog(`${getProviderName()} 下载检查失败: ${e.message}`, 'error', 'WebDAV');
    } finally {
        setIsLoading(false);
    }
  };

  const handleConfirmRestore = () => {
      if (restoreData) {
          const now = Date.now();
          const fixedConfig = restoreData.config ? {
              ...restoreData.config,
              nutstore: restoreData.config.nutstore ? { ...restoreData.config.nutstore, lastSyncTime: now } : undefined,
              infinicloud: restoreData.config.infinicloud ? { ...restoreData.config.infinicloud, lastSyncTime: now } : undefined,
          } : undefined;

          onImportAccounts(restoreData.accounts, fixedConfig, restoreData.systemLogs);
          
          setStatus('✅ 恢复成功！');
          addSystemLog(`${getProviderName()} 已从云端恢复数据，同步计时已重置`, 'success', 'WebDAV');
          setIsConfirmingRestore(false);
          setRestoreData(null);
          setTimeout(onClose, 1000);
      }
  };

  const tabs = [
      { id: 'nutstore', label: '坚果云' },
      { id: 'infinicloud', label: 'InfiniCLOUD' }
  ];
  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold text-white">多云同步管理</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>

        {/* Animated Tab Bar */}
        <div className="px-6 pt-4 pb-2 bg-gray-900/30">
            <div className="relative flex bg-black/40 p-1 rounded-xl border border-gray-700/50">
                {/* Floating Background */}
                <div 
                    className="absolute top-1 bottom-1 bg-blue-600 rounded-lg shadow-md transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
                    style={{ 
                        left: `calc(${activeIndex * 50}% + 4px)`, 
                        width: `calc(50% - 8px)` 
                    }}
                ></div>

                {tabs.map((tab) => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`relative z-10 flex-1 py-2 text-xs font-bold rounded-lg transition-colors duration-200 text-center ${
                            activeTab === tab.id 
                            ? 'text-white' 
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
           <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
               <div>
                 <label className="block text-xs text-gray-400 mb-1">WebDAV URL (Base Path)</label>
                 <input type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://dav.jianguoyun.com/dav/" className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500 font-mono" />
               </div>
               
               <div>
                 <label className="block text-xs text-gray-400 mb-1">备份文件夹名称</label>
                 <input type="text" value={backupPath} onChange={e => setBackupPath(e.target.value)} placeholder="MS_Rewards_Backups" className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500 font-mono" />
               </div>

               <div>
                 <label className="block text-xs text-gray-400 mb-1">用户名</label>
                 <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500" />
               </div>
               <div>
                 <label className="block text-xs text-gray-400 mb-1">应用密码</label>
                 <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm focus:border-blue-500" />
               </div>

               <div className="border-t border-gray-700 pt-4 mt-2">
                 <div className="flex items-center justify-between mb-3">
                     <span className="text-sm font-bold text-gray-300">自动同步开关</span>
                     <ToggleSwitch 
                        checked={autoSync} 
                        onChange={setAutoSync}
                     />
                 </div>
                 
                 <div className={`transition-all duration-300 overflow-hidden ${autoSync ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                     <div className="flex flex-col gap-2 bg-gray-900/50 p-3 rounded border border-gray-700">
                         <div className="flex items-center gap-2">
                             <span className="text-xs text-gray-400 font-mono whitespace-nowrap">同步频率:</span>
                             <div className="flex-1 flex gap-2">
                                <input 
                                    type="text" 
                                    value={cronExpression} 
                                    onChange={e => setCronExpression(e.target.value)} 
                                    className="w-full bg-black/30 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-center text-blue-300 focus:border-blue-500 outline-none" 
                                    placeholder="0 2 * * *" 
                                />
                                <button 
                                    onClick={() => setShowCronGenerator(true)}
                                    className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 rounded border border-gray-600 transition-colors whitespace-nowrap"
                                >
                                    生成
                                </button>
                             </div>
                         </div>
                     </div>
                 </div>
               </div>

               <div className="flex items-center justify-between pt-2">
                  <span className={`text-xs truncate max-w-[200px] ${status.includes('❌') ? 'text-red-400' : status.includes('✅') ? 'text-green-400' : 'text-gray-400'}`}>{status}</span>
                  <button onClick={handleSave} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs text-white transition-colors font-bold shadow-lg">保存当前配置</button>
               </div>
           </div>
        </div>
        
        {/* 操作区 */}
        <div className="p-4 border-t border-gray-700 flex gap-3">
          {isConfirmingRestore ? (
              <>
                <button onClick={() => { setIsConfirmingRestore(false); setStatus('已取消恢复'); }} className="flex-1 py-2 rounded font-medium text-sm transition-colors border border-gray-600 hover:bg-gray-700 text-gray-200">
                    取消
                </button>
                <button onClick={handleConfirmRestore} className="flex-1 py-2 rounded font-medium text-sm transition-colors bg-red-600 hover:bg-red-500 text-white animate-pulse">
                    确认覆盖本地?
                </button>
              </>
          ) : (
              <>
                <button onClick={handleCheckDownload} disabled={isLoading} className={`flex-1 py-2 rounded font-bold text-sm transition-colors border border-gray-600 hover:bg-gray-700 text-gray-200 ${isLoading ? 'opacity-50' : ''}`}>
                    {isLoading ? '连接中...' : '云端下载 (Pull)'}
                </button>
                <button onClick={handleUpload} disabled={isLoading} className={`flex-1 py-2 rounded font-bold text-sm transition-colors bg-blue-600 hover:bg-blue-500 text-white ${isLoading ? 'opacity-50' : ''}`}>
                    上传云端 (Push)
                </button>
              </>
          )}
        </div>
      </div>
    </div>
    
    <CronGeneratorModal 
        isOpen={showCronGenerator} 
        onClose={() => setShowCronGenerator(false)} 
        onApply={(expr) => setCronExpression(expr)} 
    />
    </>
  );
};

export default WebDAVModal;
