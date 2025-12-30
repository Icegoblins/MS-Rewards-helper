import React, { useState, useEffect, useMemo } from 'react';
import { Account, AppConfig, WxPusherTarget } from '../types';
import { sendNotification } from '../services/wxPusher';
import { getRandomUUID, formatTime, generateAccountReport, getDailyDiff } from '../utils/helpers';
import ToggleSwitch from './ToggleSwitch';
import CustomSelect from './CustomSelect';

interface WxPusherModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  accounts: Account[];
  onUpdateConfig: (newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
  addSystemLog: (msg: string, type: 'info'|'success'|'error', source?: string) => void;
}

const WxPusherModal: React.FC<WxPusherModalProps> = ({ isOpen, onClose, config, accounts, onUpdateConfig, addSystemLog }) => {
  const [activeMainTab, setActiveMainTab] = useState<'config' | 'manual'>('config');
  
  // --- Config Tab States ---
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null); 
  const [editTarget, setEditTarget] = useState<WxPusherTarget>({ id: '', name: '', uids: '', filterAccounts: [], enabled: true });
  const [testButtonState, setTestButtonState] = useState<{ [key: string]: 'idle' | 'confirm' | 'sending' }>({});

  // --- Manual Tab States ---
  const [manualMode, setManualMode] = useState<'single' | 'cluster'>('single'); // single=指定目标, cluster=智能分发
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [manualTargetId, setManualTargetId] = useState<string>('');
  const [isManualSending, setIsManualSending] = useState(false);
  const [manualStatusMsg, setManualStatusMsg] = useState('');

  const wxConfig = config.wxPusher || { enabled: false, appToken: '', targets: [] };
  // @ts-ignore Compatibility
  if (wxConfig.uids && !wxConfig.targets) {
      // @ts-ignore
      wxConfig.targets = [{ id: 'default', name: '默认推送', uids: wxConfig.uids, filterAccounts: wxConfig.filterAccounts || [], enabled: true }];
  }
  if (!wxConfig.targets) wxConfig.targets = [];

  // -------------------------------------------------------------------------
  // Cluster Logic (Moved before early return)
  // -------------------------------------------------------------------------
  
  // Calculate distribution plans for Cluster mode
  const clusterPlans = useMemo(() => {
      if (manualMode !== 'cluster') return [];
      
      const validTargets = wxConfig.targets.filter(t => t.enabled !== false);
      const plans = validTargets.map(target => {
          // Intersection: Accounts selected in UI AND Accounts subscribed by target
          const targetAccounts = accounts.filter(acc => {
              const isSelected = selectedAccountIds.has(acc.id);
              const isSubscribed = target.filterAccounts.length === 0 || target.filterAccounts.includes(acc.id);
              return isSelected && isSubscribed;
          });
          return { target, accounts: targetAccounts };
      }).filter(plan => plan.accounts.length > 0);
      
      return plans;
  }, [manualMode, selectedAccountIds, wxConfig.targets, accounts]);

  useEffect(() => {
      if (isOpen) {
          setActiveMainTab('config');
          setActiveTargetId(null);
          setTestButtonState({});
          
          // Manual Tab Init
          const activeIds = accounts.filter(a => a.enabled !== false).map(a => a.id);
          setSelectedAccountIds(new Set(activeIds));
          if (wxConfig.targets && wxConfig.targets.length > 0) {
              setManualTargetId(wxConfig.targets[0].id);
          }
          setManualStatusMsg('');
          setIsManualSending(false);
          setManualMode('single');
      }
  }, [isOpen, accounts]); // Depend on accounts/config to reset defaults

  if (!isOpen) return null;

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  const handleUpdateRoot = (updates: Partial<typeof wxConfig>) => {
      onUpdateConfig(prev => ({
          ...prev,
          wxPusher: { ...prev.wxPusher, ...updates } as any
      }));
  };

  // -------------------------------------------------------------------------
  // Handlers (Config)
  // -------------------------------------------------------------------------

  const handleSaveTarget = () => {
      let newTargets = [...wxConfig.targets];
      if (activeTargetId === 'new') {
          newTargets.push({ ...editTarget, id: getRandomUUID() });
      } else {
          newTargets = newTargets.map(t => t.id === activeTargetId ? editTarget : t);
      }
      handleUpdateRoot({ targets: newTargets });
      setActiveTargetId(null);
  };

  const handleDeleteTarget = (id: string) => {
      if (confirm('确认删除此分发目标？')) {
          handleUpdateRoot({ targets: wxConfig.targets.filter(t => t.id !== id) });
      }
  };
  
  const handleToggleTargetEnabled = (id: string, currentEnabled: boolean | undefined) => {
      const newTargets = wxConfig.targets.map(t => 
          t.id === id ? { ...t, enabled: currentEnabled === false } : t 
      );
      handleUpdateRoot({ targets: newTargets });
  };

  const openEdit = (target: WxPusherTarget | null) => {
      if (target) {
          setEditTarget({ ...target, enabled: target.enabled !== false });
          setActiveTargetId(target.id);
      } else {
          setEditTarget({ id: '', name: '新目标', uids: '', filterAccounts: [], enabled: true });
          setActiveTargetId('new');
      }
  };

  const toggleAccountInEdit = (accId: string) => {
      const current = editTarget.filterAccounts || [];
      if (current.includes(accId)) {
          setEditTarget({ ...editTarget, filterAccounts: current.filter(id => id !== accId) });
      } else {
          setEditTarget({ ...editTarget, filterAccounts: [...current, accId] });
      }
  };

  const handleTestClick = async (target: WxPusherTarget) => {
      const currentState = testButtonState[target.id] || 'idle';
      
      if (currentState === 'idle') {
          setTestButtonState({ ...testButtonState, [target.id]: 'confirm' });
          setTimeout(() => {
              setTestButtonState(prev => {
                  if (prev[target.id] === 'confirm') {
                      const next = { ...prev };
                      delete next[target.id];
                      return next;
                  }
                  return prev;
              });
          }, 3000);
          return;
      }
      
      if (currentState === 'confirm') {
          if (!wxConfig.appToken) return alert("请先填写全局 App Token");
          if (!target.uids) return alert("该目标未配置 UID");

          setTestButtonState({ ...testButtonState, [target.id]: 'sending' });
          try {
              const now = formatTime(Date.now());
              const content = `
\`\`\`text
M S   R E W A R D S
=== 通道测试消息 ===
日期: ${now}
目标: ${target.name}
状态: ✅ 通道畅通
=======================
\`\`\`
`.trim();
              const res = await sendNotification(
                  { enabled: true, appToken: wxConfig.appToken, uids: target.uids }, 
                  content, 
                  config.proxyUrl
              );
              if (!res.success) throw new Error(res.msg);
              addSystemLog(`测试推送至 [${target.name}] 成功`, 'success', 'Push');
          } catch (e: any) {
              alert(`❌ 发送给 [${target.name}] 失败: ${e.message}`);
          } finally {
              setTestButtonState(prev => {
                  const next = { ...prev };
                  delete next[target.id];
                  return next;
              });
          }
      }
  };

  // -------------------------------------------------------------------------
  // Handlers (Manual Send)
  // -------------------------------------------------------------------------

  const toggleManualAccount = (id: string) => {
      const newSet = new Set(selectedAccountIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedAccountIds(newSet);
  };

  const toggleManualAll = () => {
      if (selectedAccountIds.size === accounts.length) {
          setSelectedAccountIds(new Set());
      } else {
          setSelectedAccountIds(new Set(accounts.map(a => a.id)));
      }
  };

  const generateReportContent = (targetAccounts: Account[], titleSuffix: string) => {
      const nowStr = formatTime(Date.now());
      let body = '';
      let totalSelectedPoints = 0;
      let totalSelectedDiff = 0;

      targetAccounts.forEach((acc, idx) => {
          body += generateAccountReport(acc, idx + 1) + '\n';
          totalSelectedPoints += acc.totalPoints;
          totalSelectedDiff += getDailyDiff(acc);
      });

      return `
\`\`\`text
M S   R E W A R D S
=== ${titleSuffix} ===
日期: ${nowStr}
包含账号: ${targetAccounts.length} 个
-----------------------
${body.trim()}
-----------------------
📊 统计
今日总增量: ${totalSelectedDiff >= 0 ? '+' + totalSelectedDiff : totalSelectedDiff}
积分池: ${totalSelectedPoints.toLocaleString()}
=======================
\`\`\`
      `.trim();
  };

  const handleManualPush = async () => {
      if (selectedAccountIds.size === 0) {
          setManualStatusMsg('❌ 请至少选择一个账号');
          return;
      }
      if (!wxConfig.appToken) {
          setManualStatusMsg('❌ 全局配置未填写 AppToken');
          return;
      }

      setIsManualSending(true);
      
      try {
          if (manualMode === 'single') {
              // --- Single Mode Logic ---
              const target = wxConfig.targets.find(t => t.id === manualTargetId);
              if (!target || !target.uids) {
                  setManualStatusMsg('❌ 无效的目标或未配置 UID');
                  setIsManualSending(false);
                  return;
              }
              
              setManualStatusMsg('正在发送...');
              const selectedAccounts = accounts.filter(a => selectedAccountIds.has(a.id));
              const content = generateReportContent(selectedAccounts, '手动汇总报告');

              const res = await sendNotification(
                  { enabled: true, appToken: wxConfig.appToken, uids: target.uids },
                  content,
                  config.proxyUrl
              );

              if (res.success) {
                  setManualStatusMsg('✅ 推送成功');
                  addSystemLog(`手动推送 (${selectedAccounts.length}个账号) 至 [${target.name}] 成功`, 'success', 'Push');
              } else {
                  setManualStatusMsg(`❌ 失败: ${res.msg}`);
                  addSystemLog(`手动推送失败: ${res.msg}`, 'error', 'Push');
              }

          } else {
              // --- Cluster Mode Logic ---
              if (clusterPlans.length === 0) {
                  setManualStatusMsg('⚠️ 无匹配的订阅目标');
                  setIsManualSending(false);
                  return;
              }

              setManualStatusMsg('开始集群分发...');
              let successCount = 0;
              
              for (const plan of clusterPlans) {
                  const content = generateReportContent(plan.accounts, '自动订阅报告');
                  try {
                      const res = await sendNotification(
                          { enabled: true, appToken: wxConfig.appToken, uids: plan.target.uids },
                          content,
                          config.proxyUrl
                      );
                      if (res.success) {
                          successCount++;
                          addSystemLog(`集群推送至 [${plan.target.name}] 成功`, 'success', 'Push');
                      } else {
                          addSystemLog(`集群推送至 [${plan.target.name}] 失败: ${res.msg}`, 'error', 'Push');
                      }
                  } catch (e: any) {
                      addSystemLog(`集群推送至 [${plan.target.name}] 异常`, 'error', 'Push');
                  }
                  // Small delay to avoid rate limit
                  await new Promise(r => setTimeout(r, 500));
              }

              if (successCount === clusterPlans.length) {
                  setManualStatusMsg(`✅ 全部完成 (${successCount}/${clusterPlans.length})`);
              } else {
                  setManualStatusMsg(`⚠️ 部分完成 (${successCount}/${clusterPlans.length})`);
              }
          }

      } catch (e: any) {
          setManualStatusMsg(`❌ 异常: ${e.message}`);
      } finally {
          setIsManualSending(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-[50] p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700 flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50 shrink-0">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            📢 消息推送中心
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-900/30 shrink-0">
            <button 
                onClick={() => setActiveMainTab('config')}
                className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeMainTab === 'config' ? 'border-blue-500 text-blue-400 bg-gray-800/50' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
            >
                ⚙️ 推送配置
            </button>
            <button 
                onClick={() => setActiveMainTab('manual')}
                className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${activeMainTab === 'manual' ? 'border-green-500 text-green-400 bg-gray-800/50' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
            >
                📨 手动发送
            </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
            
            {/* ================= CONFIG TAB ================= */}
            {activeMainTab === 'config' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">App Token (全局)</label>
                            <input 
                                type="text" 
                                placeholder="AT_xxx..."
                                value={wxConfig.appToken} 
                                onChange={(e) => handleUpdateRoot({ appToken: e.target.value })} 
                                className="w-full bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-green-500 outline-none" 
                            />
                        </div>
                        <div className="flex flex-col justify-end h-full pt-6">
                            <ToggleSwitch 
                                checked={wxConfig.enabled} 
                                onChange={(checked) => handleUpdateRoot({ enabled: checked })}
                                label="启用推送"
                            />
                        </div>
                    </div>

                    <div className="h-[1px] bg-gray-700"></div>

                    {/* Target List or Edit */}
                    {!activeTargetId ? (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <h4 className="text-sm font-bold text-gray-300 uppercase">分发目标列表</h4>
                                <button onClick={() => openEdit(null)} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded font-bold transition-colors">
                                    + 添加目标
                                </button>
                            </div>
                            
                            <div className="space-y-2">
                                {wxConfig.targets.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8 bg-gray-900/30 rounded-lg border border-gray-700 border-dashed">
                                        暂无分发目标，请添加接收人
                                    </div>
                                ) : (
                                    wxConfig.targets.map(target => {
                                        const btnState = testButtonState[target.id] || 'idle';
                                        const isEnabled = target.enabled !== false;
                                        return (
                                            <div key={target.id} className={`bg-gray-900/50 border rounded-lg p-3 flex items-center justify-between group transition-all ${isEnabled ? 'border-gray-700 hover:border-gray-600' : 'border-gray-800 opacity-60'}`}>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`font-bold text-sm ${isEnabled ? 'text-white' : 'text-gray-500 line-through'}`}>{target.name}</span>
                                                        <span className="text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">
                                                            {target.filterAccounts.length === 0 ? '全部账号' : `${target.filterAccounts.length} 个账号`}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 mt-1 font-mono truncate max-w-[300px]" title={target.uids}>
                                                        UIDs: {target.uids}
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 items-center">
                                                    <ToggleSwitch 
                                                        checked={isEnabled} 
                                                        onChange={() => handleToggleTargetEnabled(target.id, target.enabled)} 
                                                    />
                                                    <div className="h-4 w-[1px] bg-gray-700 mx-1"></div>
                                                    <button 
                                                        onClick={() => handleTestClick(target)} 
                                                        disabled={btnState === 'sending'}
                                                        className={`px-2 py-1 text-xs rounded border transition-all flex items-center gap-1 min-w-[4rem] justify-center font-bold ${
                                                            btnState === 'confirm' 
                                                            ? 'bg-yellow-600 border-yellow-500 text-white animate-pulse' 
                                                            : btnState === 'sending'
                                                            ? 'bg-blue-900/30 border-blue-800 text-blue-400 cursor-wait'
                                                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'
                                                        }`}
                                                    >
                                                        {btnState === 'confirm' ? '确认?' : btnState === 'sending' ? '...' : '🔔 测试'}
                                                    </button>
                                                    <button onClick={() => openEdit(target)} className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                                    </button>
                                                    <button onClick={() => handleDeleteTarget(target.id)} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                            <div className="flex items-center gap-2 mb-4">
                                <button onClick={() => setActiveTargetId(null)} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs">← 返回列表</button>
                                <span className="text-gray-600">|</span>
                                <span className="text-sm font-bold text-white">编辑目标</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1.5">备注名称</label>
                                    <input 
                                        type="text" value={editTarget.name} onChange={e => setEditTarget({...editTarget, name: e.target.value})}
                                        className="w-full bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 mb-1.5">UIDs (逗号分隔)</label>
                                    <input 
                                        type="text" value={editTarget.uids} onChange={e => setEditTarget({...editTarget, uids: e.target.value})}
                                        className="w-full bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 outline-none" 
                                    />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-bold text-gray-400 uppercase">自动推送订阅账号</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">启用此目标</span>
                                        <ToggleSwitch checked={editTarget.enabled !== false} onChange={c => setEditTarget({...editTarget, enabled: c})} />
                                    </div>
                                </div>
                                <div className="bg-black/20 rounded-lg border border-gray-700 p-2 max-h-48 overflow-y-auto custom-scrollbar grid grid-cols-2 gap-2">
                                    {accounts.length === 0 ? <div className="text-gray-500 text-xs col-span-2 text-center py-4">暂无账号</div> : 
                                        accounts.map(acc => {
                                            const isChecked = editTarget.filterAccounts.includes(acc.id);
                                            return (
                                                <label key={acc.id} className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer border transition-all ${isChecked ? 'bg-blue-900/20 border-blue-500/50' : 'bg-gray-800/50 border-transparent hover:bg-gray-800'}`}>
                                                    <input type="checkbox" checked={isChecked} onChange={() => toggleAccountInEdit(acc.id)} className="hidden" />
                                                    <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                                                        {isChecked && <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7"></path></svg>}
                                                    </div>
                                                    <span className={`text-sm ${isChecked ? 'text-blue-100' : 'text-gray-400'}`}>{acc.name}</span>
                                                </label>
                                            );
                                        })
                                    }
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1">* 若不勾选任何账号，自动任务时将推送所有账号的消息。</p>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button onClick={() => setActiveTargetId(null)} className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white">取消</button>
                                <button onClick={handleSaveTarget} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded shadow-lg">保存目标</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ================= MANUAL TAB ================= */}
            {activeMainTab === 'manual' && (
                <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                    
                    {/* Mode Toggle */}
                    <div className="bg-black/30 p-1 rounded-lg flex shrink-0">
                        <button 
                            onClick={() => setManualMode('single')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${manualMode === 'single' ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            指定目标 (Single)
                        </button>
                        <button 
                            onClick={() => setManualMode('cluster')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${manualMode === 'cluster' ? 'bg-purple-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            智能分发 (Cluster)
                        </button>
                    </div>

                    {/* Mode Content */}
                    <div className="flex-1 flex flex-col min-h-0 space-y-4">
                        {manualMode === 'single' && (
                            <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">推送到 (Target)</label>
                                {wxConfig.targets.length === 0 ? (
                                    <div className="bg-red-900/20 border border-red-800 p-3 rounded text-sm text-red-300">
                                        未配置推送目标，请先切换到“配置”标签添加目标。
                                    </div>
                                ) : (
                                    <CustomSelect 
                                        value={manualTargetId} 
                                        options={wxConfig.targets.filter(t => t.enabled !== false).map(t => ({ label: `${t.name} (${t.uids.substring(0, 10)}...)`, value: t.id }))} 
                                        onChange={setManualTargetId} 
                                    />
                                )}
                            </div>
                        )}

                        {manualMode === 'cluster' && (
                            <div className="bg-purple-900/20 border border-purple-800/30 rounded-lg p-3 animate-in fade-in slide-in-from-right-2 duration-200">
                                <div className="text-xs font-bold text-purple-300 mb-2 uppercase flex justify-between items-center">
                                    <span>分发预览 (Preview)</span>
                                    <span className="bg-purple-800 px-2 py-0.5 rounded-full text-[10px] text-white">{clusterPlans.length} 目标</span>
                                </div>
                                <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                                    {clusterPlans.length === 0 ? (
                                        <div className="text-gray-500 text-xs italic">无匹配目标 (请勾选账号或检查目标订阅)</div>
                                    ) : (
                                        clusterPlans.map(plan => (
                                            <div key={plan.target.id} className="flex justify-between items-center text-xs bg-purple-900/30 px-2 py-1 rounded">
                                                <span className="text-gray-300 truncate max-w-[150px]">{plan.target.name}</span>
                                                <span className="text-purple-400 font-mono font-bold">{plan.accounts.length} 账号</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Account Selector */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex justify-between items-center mb-2 shrink-0">
                                <label className="text-xs font-bold text-gray-400 uppercase">
                                    选择推送内容 ({selectedAccountIds.size}/{accounts.length})
                                </label>
                                <button onClick={toggleManualAll} className="text-xs text-blue-400 hover:text-blue-300 font-medium">
                                    {selectedAccountIds.size === accounts.length ? '取消全选' : '全选'}
                                </button>
                            </div>
                            <div className="bg-black/20 border border-gray-700 rounded-lg p-2 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                                {accounts.map(acc => {
                                    const isSelected = selectedAccountIds.has(acc.id);
                                    return (
                                        <div 
                                            key={acc.id}
                                            onClick={() => toggleManualAccount(acc.id)}
                                            className={`flex items-center gap-3 p-2 rounded cursor-pointer border transition-all ${isSelected ? 'bg-green-900/20 border-green-500/50' : 'bg-gray-800/50 border-transparent hover:bg-gray-800'}`}
                                        >
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-green-500 border-green-500' : 'border-gray-500'}`}>
                                                {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                                <span className={`text-sm font-medium truncate ${isSelected ? 'text-green-100' : 'text-gray-400'}`}>{acc.name}</span>
                                                <span className="text-[10px] text-gray-500 font-mono">{acc.totalPoints.toLocaleString()} pts</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Manual Footer Action */}
                    <div className="pt-2 border-t border-gray-700/50 shrink-0 flex items-center justify-between">
                        <span className={`text-xs font-bold truncate pr-2 ${manualStatusMsg.includes('❌') ? 'text-red-400' : manualStatusMsg.includes('⚠️') ? 'text-yellow-400' : 'text-green-400'}`}>
                            {manualStatusMsg}
                        </span>
                        <button 
                            onClick={handleManualPush}
                            disabled={isManualSending || wxConfig.targets.length === 0 || selectedAccountIds.size === 0}
                            className={`px-6 py-2.5 rounded-lg font-bold text-sm text-white shadow-lg transition-all ${isManualSending ? 'bg-gray-600 cursor-wait' : manualMode === 'cluster' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-green-600 hover:bg-green-500'}`}
                        >
                            {isManualSending ? '发送中...' : manualMode === 'cluster' ? `集群推送 (${clusterPlans.length})` : '立即发送'}
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default WxPusherModal;