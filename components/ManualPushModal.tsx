import React, { useState, useEffect, useMemo } from 'react';
import { Account, AppConfig } from '../types';
import { sendNotification } from '../services/wxPusher';
import { formatTime, generateAccountReport, getDailyDiff } from '../utils/helpers';
import CustomSelect from './CustomSelect';

interface ManualPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  config: AppConfig;
  addSystemLog: (msg: string, type: 'info'|'success'|'error', source?: string) => void;
}

const ManualPushModal: React.FC<ManualPushModalProps> = ({ isOpen, onClose, accounts, config, addSystemLog }) => {
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // 获取有效的推送目标
  const targets = useMemo(() => {
      return config.wxPusher?.targets?.filter(t => t.enabled !== false) || [];
  }, [config.wxPusher]);

  // 初始化：默认全选，默认选中第一个目标
  useEffect(() => {
      if (isOpen) {
          // 默认选中所有状态正常的账号
          const activeIds = accounts.filter(a => a.enabled !== false).map(a => a.id);
          setSelectedAccountIds(new Set(activeIds));
          
          if (targets.length > 0) {
              setSelectedTargetId(targets[0].id);
          }
          setStatusMsg('');
          setIsSending(false);
      }
  }, [isOpen, accounts, targets]);

  if (!isOpen) return null;

  const toggleAccount = (id: string) => {
      const newSet = new Set(selectedAccountIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedAccountIds(newSet);
  };

  const toggleAll = () => {
      if (selectedAccountIds.size === accounts.length) {
          setSelectedAccountIds(new Set());
      } else {
          setSelectedAccountIds(new Set(accounts.map(a => a.id)));
      }
  };

  const handlePush = async () => {
      if (selectedAccountIds.size === 0) {
          setStatusMsg('❌ 请至少选择一个账号');
          return;
      }
      if (!config.wxPusher?.appToken) {
          setStatusMsg('❌ 未配置 WxPusher AppToken');
          return;
      }
      const target = targets.find(t => t.id === selectedTargetId);
      if (!target || !target.uids) {
          setStatusMsg('❌ 无效的推送目标');
          return;
      }

      setIsSending(true);
      setStatusMsg('正在发送...');

      try {
          // 关键：只获取被选中的账号
          const selectedAccounts = accounts.filter(a => selectedAccountIds.has(a.id));
          const nowStr = formatTime(Date.now());
          let content = '';

          // 策略：单账号 vs 多账号
          if (selectedAccounts.length === 1) {
              const acc = selectedAccounts[0];
              const report = generateAccountReport(acc, 1); // 使用标准详细报告
              const diff = getDailyDiff(acc);
              
              content = `
\`\`\`text
M S   R E W A R D S
=== 账号快报 (手动) ===
日期: ${nowStr}
-----------------------
${report}
💰 今日增量: +${diff}
=======================
\`\`\`
              `.trim();
          } else {
              // 汇总推送
              let body = '';
              let totalSelectedPoints = 0;
              let totalSelectedDiff = 0;

              selectedAccounts.forEach((acc, index) => {
                  body += generateAccountReport(acc, index + 1) + '\n';
                  // 统计：只累加选中的账号
                  totalSelectedPoints += acc.totalPoints;
                  totalSelectedDiff += getDailyDiff(acc);
              });

              content = `
\`\`\`text
M S   R E W A R D S
=== 账号汇总 (手动) ===
日期: ${nowStr}
包含账号: ${selectedAccounts.length} 个
-----------------------
${body.trim()}
-----------------------
📊 统计 (仅选中)
今日总增量: ${totalSelectedDiff >= 0 ? '+' + totalSelectedDiff : totalSelectedDiff}
选中积分池: ${totalSelectedPoints.toLocaleString()}
=======================
\`\`\`
              `.trim();
          }

          const res = await sendNotification(
              { enabled: true, appToken: config.wxPusher.appToken, uids: target.uids },
              content,
              config.proxyUrl
          );

          if (res.success) {
              setStatusMsg('✅ 推送成功');
              addSystemLog(`手动推送 (${selectedAccounts.length}个账号) 至 [${target.name}] 成功`, 'success', 'Push');
              setTimeout(onClose, 1500);
          } else {
              setStatusMsg(`❌ 失败: ${res.msg}`);
              addSystemLog(`手动推送失败: ${res.msg}`, 'error', 'Push');
          }

      } catch (e: any) {
          setStatusMsg(`❌ 异常: ${e.message}`);
          addSystemLog(`手动推送异常: ${e.message}`, 'error', 'Push');
      } finally {
          setIsSending(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-[90] p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            📨 手动消息推送
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
            
            {/* Target Selector */}
            <div>
                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase">推送到 (Target)</label>
                {targets.length === 0 ? (
                    <div className="bg-red-900/20 border border-red-800 p-3 rounded text-sm text-red-300">
                        未配置推送目标，请先去“消息推送”设置中添加。
                    </div>
                ) : (
                    <CustomSelect 
                        value={selectedTargetId} 
                        options={targets.map(t => ({ label: `${t.name} (${t.uids.substring(0, 10)}...)`, value: t.id }))} 
                        onChange={setSelectedTargetId} 
                    />
                )}
            </div>

            {/* Account Selector */}
            <div className="flex-1 min-h-[200px] flex flex-col">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-gray-400 uppercase">
                        选择账号 ({selectedAccountIds.size}/{accounts.length})
                    </label>
                    <button onClick={toggleAll} className="text-xs text-blue-400 hover:text-blue-300">
                        {selectedAccountIds.size === accounts.length ? '取消全选' : '全选'}
                    </button>
                </div>
                <div className="bg-black/20 border border-gray-700 rounded-lg p-2 overflow-y-auto custom-scrollbar max-h-[300px] grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {accounts.map(acc => {
                        const isSelected = selectedAccountIds.has(acc.id);
                        return (
                            <div 
                                key={acc.id}
                                onClick={() => toggleAccount(acc.id)}
                                className={`flex items-center gap-3 p-2 rounded cursor-pointer border transition-all ${isSelected ? 'bg-blue-900/20 border-blue-500/50' : 'bg-gray-800/50 border-transparent hover:bg-gray-800'}`}
                            >
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-500'}`}>
                                    {isSelected && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>{acc.name}</span>
                                    <span className="text-[10px] text-gray-500 font-mono">{acc.totalPoints.toLocaleString()} pts</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Hint */}
            <div className="bg-gray-900/30 p-3 rounded border border-gray-700/50 text-xs text-gray-400">
                <p>• <strong>单选格式：</strong> 发送该账号的详细快报。</p>
                <p>• <strong>多选格式：</strong> 发送包含所有选中账号的汇总报告。</p>
                <p>• <strong>积分统计：</strong> “积分池”与“今日增量”仅统计上方勾选的账号。</p>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/30 flex justify-between items-center">
            <span className={`text-xs font-bold ${statusMsg.includes('❌') ? 'text-red-400' : 'text-green-400'}`}>
                {statusMsg}
            </span>
            <button 
                onClick={handlePush} 
                disabled={isSending || targets.length === 0 || selectedAccountIds.size === 0}
                className={`px-6 py-2 rounded-lg font-bold text-sm text-white shadow-lg transition-all ${isSending ? 'bg-gray-600 cursor-wait' : 'bg-blue-600 hover:bg-blue-500'}`}
            >
                {isSending ? '发送中...' : '立即推送'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default ManualPushModal;