
import React, { useState, useEffect } from 'react';
import { Account, AppConfig, LocalBackupConfig } from '../types';
import { getRandomUUID } from '../utils/helpers';
import CronGeneratorModal from './CronGeneratorModal';

interface DataManageModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  config: AppConfig;
  onImport: (newAccounts: Account[], newConfig: AppConfig | null, mode: 'merge' | 'overwrite') => void;
  addSystemLog: (msg: string, type: 'info'|'success'|'error', source?: string) => void;
}

const DataManageModal: React.FC<DataManageModalProps> = ({ isOpen, onClose, accounts, config, onImport, addSystemLog }) => {
  const [view, setView] = useState<'main' | 'fileList'>('main');
  const [files, setFiles] = useState<{name: string, mtime: string}[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  
  // 自动备份配置状态
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [backupCron, setBackupCron] = useState('0 12 * * *');
  const [maxBackupFiles, setMaxBackupFiles] = useState(30);
  const [showCronGenerator, setShowCronGenerator] = useState(false);

  // 初始化配置状态
  useEffect(() => {
    if (isOpen) {
        setView('main');
        setStatus('');
        setFiles([]);
        setSelectedFile(null);
        setIsLoading(false);
        
        // 加载当前自动备份配置
        const lb = config.localBackup;
        setAutoBackupEnabled(lb?.enabled || false);
        setBackupCron(lb?.cronExpression || '0 12 * * *');
        setMaxBackupFiles(lb?.maxFiles || 30);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // Only run on open toggle, ignore config changes to prevent status flash

  // 保存自动备份配置
  const saveAutoBackupConfig = async () => {
      const newConfig: LocalBackupConfig = {
          enabled: autoBackupEnabled,
          path: config.localBackup?.path || 'backups', 
          cronExpression: backupCron,
          maxFiles: maxBackupFiles,
          lastRunTime: config.localBackup?.lastRunTime
      };
      
      const updatedAppConfig = { ...config, localBackup: newConfig };
      onImport(accounts, updatedAppConfig, 'merge'); 
      setStatus('✅ 自动备份策略已保存');
      
      // 让提示停留久一点
      await new Promise(r => setTimeout(r, 2000));
      setStatus('');
  };

  if (!isOpen) return null;

  // 调用本地代理 API
  const proxyFs = async (action: 'list' | 'read' | 'write', payload: any = {}) => {
      let proxyBase = config.proxyUrl.trim();
      if (!proxyBase.startsWith('http')) proxyBase = `http://${proxyBase}`;
      if (proxyBase.endsWith('/')) proxyBase = proxyBase.slice(0, -1);
      
      const backupPath = config.localBackup?.path || config.localBackupPath || 'backups';
      const baseUrl = `${proxyBase}/api/local/file?action=${action}&path=${encodeURIComponent(backupPath)}`;

      if (action === 'write') {
          return await fetch(baseUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
      } else if (action === 'read') {
          return await fetch(`${baseUrl}&filename=${encodeURIComponent(payload.filename)}`);
      } else {
          return await fetch(baseUrl);
      }
  };

  const handleExport = async () => {
    setIsLoading(true);
    setStatus('正在导出到本地...');
    
    // 新的文件名格式: MS_Rewards_Backup_YYYY-MM-DD-HH-mm.json
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeString = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const filename = `MS_Rewards_Backup_${timeString}.json`;

    const content = JSON.stringify({
        accounts,
        config: config, 
        exportDate: now.toISOString(),
        version: "2.8.0"
    }, null, 2);

    try {
        const res = await proxyFs('write', { filename, content });
        if (res.ok) {
            setStatus(`✅ 导出成功: ${filename}`);
            addSystemLog(`本地备份成功: ${filename}`, 'success', 'Backup');
        } else {
            const err = await res.json();
            throw new Error(err.msg || res.statusText);
        }
    } catch (e: any) {
        setStatus(`❌ 导出失败: ${e.message} (请确保代理已启动)`);
    } finally {
        setIsLoading(false);
        // 保留成功/失败消息 3秒
        setTimeout(() => setStatus(''), 3000);
    }
  };

  const loadFileList = async () => {
      setIsLoading(true);
      setStatus('加载文件列表...');
      try {
          const res = await proxyFs('list');
          if (res.ok) {
              const data = await res.json();
              setFiles(data.files);
              setView('fileList');
              setStatus('');
          } else {
              throw new Error("无法连接本地代理");
          }
      } catch (e: any) {
          setStatus(`❌ 获取列表失败: ${e.message}`);
          setTimeout(() => setStatus(''), 3000);
      } finally {
          setIsLoading(false);
      }
  };

  const handleConfirmImport = async () => {
      if (!selectedFile) return;
      setIsLoading(true);
      setStatus('读取文件中...');
      try {
          const res = await proxyFs('read', { filename: selectedFile });
          if (res.ok) {
              const data = await res.json();
              const parsed = JSON.parse(data.content);
              
              const validAccounts = parsed.accounts.map((acc: any) => ({
                ...acc,
                id: acc.id || getRandomUUID(),
                logs: Array.isArray(acc.logs) ? acc.logs : [], 
                pointHistory: Array.isArray(acc.pointHistory) ? acc.pointHistory : [],
                // 修复逻辑：保留 risk/success/error 状态，仅将 running/refreshing 等中间态重置为 idle
                status: (['running', 'refreshing', 'waiting'].includes(acc.status) || !acc.status) ? 'idle' : acc.status,
                // 导入时如果字段缺失，默认启用
                enabled: acc.enabled !== false 
              }));

              onImport(validAccounts, parsed.config || null, 'overwrite');
              setStatus('✅ 导入成功!');
              addSystemLog(`从本地导入数据: ${selectedFile}`, 'success', 'Backup');
              setTimeout(onClose, 1000);
          }
      } catch (e: any) {
          setStatus(`❌ 导入失败: ${e.message}`);
          setTimeout(() => setStatus(''), 3000);
      } finally {
          setIsLoading(false);
      }
  };

  return (
    <>
    <div 
        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4 transition-all duration-300"
        onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 flex flex-col overflow-hidden max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
             📂 本地备份管理
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
            {view === 'main' ? (
                <div className="flex flex-col gap-6">
                    {/* 手动操作区 */}
                    <div className="flex flex-col gap-3">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">手动操作</p>
                        <button 
                            onClick={handleExport}
                            disabled={isLoading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-white font-bold shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2 text-sm"
                        >
                            {isLoading ? '处理中...' : (
                                <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                                立即备份到本地 (Save)
                                </>
                            )}
                        </button>
                        <button 
                            onClick={loadFileList}
                            disabled={isLoading}
                            className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-bold border border-gray-600 transition-transform active:scale-95 flex items-center justify-center gap-2 text-sm"
                        >
                            {isLoading ? '加载中...' : (
                                <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                                恢复历史备份 (Restore)
                                </>
                            )}
                        </button>
                    </div>

                    <div className="h-[1px] bg-gray-700"></div>

                    {/* 自动备份策略配置区 */}
                    <div className="flex flex-col gap-4 bg-gray-900/40 p-4 rounded-xl border border-gray-700/50">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">自动备份策略</p>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={autoBackupEnabled} onChange={e => setAutoBackupEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                        </div>
                        
                        <div className={`space-y-3 transition-all duration-300 ${autoBackupEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-500">备份频率 (Cron)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={backupCron} 
                                        onChange={e => setBackupCron(e.target.value)} 
                                        className="flex-1 bg-black/30 border border-gray-600 rounded px-2 py-1.5 text-xs font-mono text-center text-blue-300 focus:border-blue-500 outline-none" 
                                    />
                                    <button onClick={() => setShowCronGenerator(true)} className="px-3 bg-gray-700 hover:bg-gray-600 text-xs rounded border border-gray-600 text-gray-300">生成</button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-gray-500">最大保留份数 (滚动删除旧文件)</label>
                                <input 
                                    type="number" 
                                    value={maxBackupFiles} 
                                    onChange={e => setMaxBackupFiles(Number(e.target.value))} 
                                    className="w-full bg-black/30 border border-gray-600 rounded px-2 py-1.5 text-xs text-center text-white focus:border-blue-500 outline-none" 
                                />
                            </div>
                            <button onClick={saveAutoBackupConfig} className="w-full mt-2 py-2 bg-emerald-700 hover:bg-emerald-600 rounded text-xs text-white font-bold transition-colors">
                                保存策略配置
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col flex-1 h-full min-h-[300px]">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-bold text-gray-300">选择历史备份:</span>
                        <button onClick={() => setView('main')} className="text-xs text-blue-400 hover:underline">返回</button>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-700 rounded-lg bg-black/20 p-2 space-y-1 max-h-[300px]">
                        {files.length === 0 ? (
                            <div className="text-center text-gray-500 py-8 text-sm">暂无备份文件</div>
                        ) : (
                            files.map((f, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => setSelectedFile(f.name)}
                                    className={`w-full text-left px-3 py-2 rounded text-sm flex justify-between items-center ${selectedFile === f.name ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
                                >
                                    <span className="truncate flex-1 font-mono text-xs">{f.name}</span>
                                    <span className="text-xs opacity-60 ml-2 whitespace-nowrap">{new Date(f.mtime).toLocaleString()}</span>
                                </button>
                            ))
                        )}
                    </div>
                    {selectedFile && (
                        <div className="mt-4 pt-4 border-t border-gray-700 animate-in slide-in-from-bottom-2">
                             <p className="text-xs text-red-400 mb-2 text-center">⚠️ 警告: 导入将覆盖当前所有账号数据</p>
                             <button 
                                onClick={handleConfirmImport}
                                disabled={isLoading}
                                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg"
                             >
                                 {isLoading ? '导入中...' : '确认覆盖导入'}
                             </button>
                        </div>
                    )}
                </div>
            )}

            {/* 固定高度的状态提示栏，防止布局跳动 */}
            <div className="h-8 mt-4 flex items-center justify-center">
                {status && (
                    <div className="text-xs font-mono font-bold text-yellow-400 bg-gray-900/50 py-2 px-4 rounded border border-yellow-500/20 animate-in fade-in duration-200">
                        {status}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
    <CronGeneratorModal 
        isOpen={showCronGenerator} 
        onClose={() => setShowCronGenerator(false)} 
        onApply={(expr) => setBackupCron(expr)} 
    />
    </>
  );
};

export default DataManageModal;
