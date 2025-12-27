
import React, { useState, useEffect, useRef } from 'react';
import { Account, AppConfig, WxPusherTarget } from '../types';
import { sendNotification } from '../services/wxPusher';
import { getRandomUUID, formatTime } from '../utils/helpers';
import ToggleSwitch from './ToggleSwitch';

interface WxPusherModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  accounts: Account[];
  onUpdateConfig: (newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
}

const WxPusherModal: React.FC<WxPusherModalProps> = ({ isOpen, onClose, config, accounts, onUpdateConfig }) => {
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [testingTargetId, setTestingTargetId] = useState<string | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null); 
  const [editTarget, setEditTarget] = useState<WxPusherTarget>({ id: '', name: '', uids: '', filterAccounts: [], enabled: true });
  
  // 防止误触：测试按钮状态 (id -> 'confirm' | 'sending')
  const [testButtonState, setTestButtonState] = useState<{ [key: string]: 'idle' | 'confirm' | 'sending' }>({});

  useEffect(() => {
      if (isOpen) {
          setActiveTargetId(null);
          setIsTestingPush(false);
          setTestingTargetId(null);
          setTestButtonState({});
      }
  }, [isOpen]);

  if (!isOpen) return null;

  const wxConfig = config.wxPusher || { enabled: false, appToken: '', targets: [] };
  
  // @ts-ignore
  if (wxConfig.uids && !wxConfig.targets) {
      // @ts-ignore
      wxConfig.targets = [{ id: 'default', name: '默认推送', uids: wxConfig.uids, filterAccounts: wxConfig.filterAccounts || [], enabled: true }];
  }
  if (!wxConfig.targets) wxConfig.targets = [];

  const handleUpdateRoot = (updates: Partial<typeof wxConfig>) => {
      onUpdateConfig(prev => ({
          ...prev,
          wxPusher: { ...prev.wxPusher, ...updates } as any
      }));
  };

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
          t.id === id ? { ...t, enabled: currentEnabled === false } : t // Toggle logic
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

  // 生成测试用的小票内容 (模拟多账号效果)
  const generateTestReceipt = (targetName: string) => {
      const now = formatTime(Date.now());
      return `
\`\`\`text
M S   R E W A R D S
=== 任务小票 (测试) ===
日期: ${now}
目标: ${targetName}
-----------------------
[1] 模拟账户 A
● 状态: ✅ 执行成功
● 积分: 12,500 (本轮:+150 / 昨日:+300)
● 阅读: 30/30
● 搜索: 电脑(90/90) 移动(60/60)
● 签到: APP(已签) Web(已签)
-----------------------
[2] 模拟账户 B
● 状态: ❌ 执行失败
● 积分: 5,000 (本轮:+0 / 昨日:-10)
● 阅读: 0/30
● 搜索: 电脑(0/90) 移动(0/60)
● 签到: APP(未签) Web(无数据)
-----------------------
📊 汇总统计
-----------------------
成功: 1   失败: 1
💰 本轮收益: 150
🏆 积分总池: 17,500
=======================
\`\`\`
`.trim();
  };

  // 单独测试某个目标 (带防误触逻辑)
  const handleTestClick = async (target: WxPusherTarget) => {
      const currentState = testButtonState[target.id] || 'idle';
      
      if (currentState === 'idle') {
          // 第一次点击：进入确认状态
          setTestButtonState({ ...testButtonState, [target.id]: 'confirm' });
          // 3秒后自动恢复，防止一直处于确认状态
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
          // 第二次点击：执行发送
          if (!wxConfig.appToken) return alert("请先填写全局 App Token");
          if (!target.uids) return alert("该目标未配置 UID");

          setTestButtonState({ ...testButtonState, [target.id]: 'sending' });
          try {
              const content = generateTestReceipt(target.name);
              const res = await sendNotification(
                  { enabled: true, appToken: wxConfig.appToken, uids: target.uids }, 
                  content, 
                  config.proxyUrl
              );
              if (!res.success) throw new Error(res.msg);
              console.log(`Test sent to ${target.name}`);
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

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700 flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            📢 微信推送配置 (WxPusher)
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
            
            {/* Global Settings */}
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

            {/* Target List View */}
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
                                            {/* Enable Toggle */}
                                            <ToggleSwitch 
                                                checked={isEnabled} 
                                                onChange={() => handleToggleTargetEnabled(target.id, target.enabled)} 
                                            />
                                            <div className="h-4 w-[1px] bg-gray-700 mx-1"></div>
                                            
                                            {/* Safe Test Button */}
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
                                                title={btnState === 'confirm' ? "再次点击以发送" : "发送测试消息"}
                                            >
                                                {btnState === 'confirm' ? '确认?' : btnState === 'sending' ? '...' : '🔔 测试'}
                                            </button>
                                            
                                            <button onClick={() => openEdit(target)} className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded" title="编辑">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                            </button>
                                            <button onClick={() => handleDeleteTarget(target.id)} className="p-1.5 text-red-400 hover:bg-red-900/30 rounded" title="删除">
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
                /* Edit View */
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
                    <div className="flex items-center gap-2 mb-4">
                        <button onClick={() => setActiveTargetId(null)} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs">
                            ← 返回列表
                        </button>
                        <span className="text-gray-600">|</span>
                        <span className="text-sm font-bold text-white">编辑目标</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1.5">备注名称</label>
                            <input 
                                type="text" 
                                value={editTarget.name} 
                                onChange={e => setEditTarget({...editTarget, name: e.target.value})}
                                placeholder="例如: 家人" 
                                className="w-full bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 mb-1.5">接收人 UIDs (逗号分隔)</label>
                            <input 
                                type="text" 
                                value={editTarget.uids} 
                                onChange={e => setEditTarget({...editTarget, uids: e.target.value})}
                                placeholder="UID_xxx, UID_yyy" 
                                className="w-full bg-black/40 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-blue-500 outline-none" 
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase">
                                选择要推送的账号 ({editTarget.filterAccounts.length === 0 ? '所有账号' : `已选 ${editTarget.filterAccounts.length}`})
                            </label>
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
                        <p className="text-[10px] text-gray-500 mt-1">* 若不勾选任何账号，则默认推送所有账号的消息。</p>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button onClick={() => setActiveTargetId(null)} className="px-4 py-2 text-sm font-bold text-gray-400 hover:text-white">取消</button>
                        <button onClick={handleSaveTarget} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded shadow-lg">保存目标</button>
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/30 flex justify-end items-center">
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-colors text-sm">
                完成设置
            </button>
        </div>
      </div>
    </div>
  );
};

export default WxPusherModal;
