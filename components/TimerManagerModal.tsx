
import React, { useState, useEffect } from 'react';
import { Account, AppConfig } from '../types';
import { getNextRunDate, formatTime, formatShortDate, formatDuration } from '../utils/helpers';
import ToggleSwitch from './ToggleSwitch';

interface TimerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  accounts: Account[];
  onUpdateConfig: (newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
  onUpdateAccount: (id: string, updates: Partial<Account>) => void;
}

interface TimerItem {
    id: string;
    type: 'system' | 'account';
    name: string;
    cron: string;
    enabled: boolean;
    lastRun: number;
    nextRun: Date | null;
    tags: string[];
}

const TimerManagerModal: React.FC<TimerManagerModalProps> = ({ isOpen, onClose, config, accounts, onUpdateConfig, onUpdateAccount }) => {
  const [timers, setTimers] = useState<TimerItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0); // 强制刷新视图
  const [statusMsg, setStatusMsg] = useState('');

  // Add countdown refresher
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
      if (isOpen) {
          const timer = setInterval(() => setNow(Date.now()), 1000);
          return () => clearInterval(timer);
      }
  }, [isOpen]);

  useEffect(() => {
      if (isOpen) {
          calculateTimers();
      }
  }, [isOpen, config, accounts, refreshKey]);

  const showToast = (msg: string) => {
      setStatusMsg(msg);
      setTimeout(() => setStatusMsg(''), 2000);
  };

  const calculateTimers = () => {
      const list: TimerItem[] = [];

      // 1. 系统级定时器
      // 全局任务
      if (config.cron) {
          list.push({
              id: 'sys_global',
              type: 'system',
              name: '全局任务调度',
              cron: config.cron.cronExpression,
              enabled: config.cron.enabled,
              lastRun: config.cron.lastRunTime || 0,
              nextRun: getNextRunDate(config.cron.cronExpression),
              tags: ['Task']
          });
      }
      // 本地备份
      if (config.localBackup) {
          list.push({
              id: 'sys_backup',
              type: 'system',
              name: '本地自动备份',
              cron: config.localBackup.cronExpression,
              enabled: config.localBackup.enabled,
              lastRun: config.localBackup.lastRunTime || 0,
              nextRun: getNextRunDate(config.localBackup.cronExpression),
              tags: ['Backup']
          });
      }
      // 坚果云
      if (config.nutstore) {
          list.push({
              id: 'sys_nutstore',
              type: 'system',
              name: '坚果云同步',
              cron: config.nutstore.cronExpression || '',
              enabled: config.nutstore.autoSync || false,
              lastRun: config.nutstore.lastSyncTime || 0,
              nextRun: getNextRunDate(config.nutstore.cronExpression || ''),
              tags: ['Cloud']
          });
      }
      // InfiniCloud
      if (config.infinicloud) {
          list.push({
              id: 'sys_infinicloud',
              type: 'system',
              name: 'InfiniCloud 同步',
              cron: config.infinicloud.cronExpression || '',
              enabled: config.infinicloud.autoSync || false,
              lastRun: config.infinicloud.lastSyncTime || 0,
              nextRun: getNextRunDate(config.infinicloud.cronExpression || ''),
              tags: ['Cloud']
          });
      }

      // 2. 账号级定时器
      accounts.forEach(acc => {
          if (acc.cronExpression) {
              list.push({
                  id: acc.id,
                  type: 'account',
                  name: acc.name,
                  cron: acc.cronExpression,
                  enabled: acc.enabled !== false && acc.cronEnabled !== false, // 只有当账户启用且 Cron 启用时才为真
                  lastRun: acc.lastRunTime || 0,
                  nextRun: getNextRunDate(acc.cronExpression),
                  tags: ['Account']
              });
          }
      });

      setTimers(list);
  };

  const handleToggle = (timer: TimerItem, checked: boolean) => {
      if (timer.type === 'system') {
          onUpdateConfig(prev => {
              const next = { ...prev };
              if (timer.id === 'sys_global' && next.cron) next.cron = { ...next.cron, enabled: checked };
              if (timer.id === 'sys_backup' && next.localBackup) next.localBackup = { ...next.localBackup, enabled: checked };
              if (timer.id === 'sys_nutstore' && next.nutstore) next.nutstore = { ...next.nutstore, autoSync: checked };
              if (timer.id === 'sys_infinicloud' && next.infinicloud) next.infinicloud = { ...next.infinicloud, autoSync: checked };
              return next;
          });
      } else {
          // 修改：只切换独立定时器开关，不影响账号本身的 enabled 状态
          onUpdateAccount(timer.id, { cronEnabled: checked });
      }
      showToast(`${checked ? '启用' : '禁用'}: ${timer.name} 的计时器`);
  };

  // 重置逻辑：将 LastRunTime 归零
  const handleReset = (timer: TimerItem) => {
      if (!confirm('⚠️ 确定要重置上次运行时间吗？\n\n此操作会将“Last Run”清零。如果当前时间符合 Cron 规则，可能会导致任务立即执行。')) return;

      if (timer.type === 'system') {
          onUpdateConfig(prev => {
              const next = { ...prev };
              if (timer.id === 'sys_global' && next.cron) next.cron = { ...next.cron, lastRunTime: 0 };
              if (timer.id === 'sys_backup' && next.localBackup) next.localBackup = { ...next.localBackup, lastRunTime: 0 };
              if (timer.id === 'sys_nutstore' && next.nutstore) next.nutstore = { ...next.nutstore, lastSyncTime: 0 };
              if (timer.id === 'sys_infinicloud' && next.infinicloud) next.infinicloud = { ...next.infinicloud, lastSyncTime: 0 };
              return next;
          });
      } else {
          onUpdateAccount(timer.id, { lastRunTime: 0 });
      }
      showToast(`已重置: ${timer.name}`);
      setRefreshKey(k => k + 1);
  };

  // 校准逻辑：仅重新计算 Next Run (UI 刷新)
  const handleCalibrate = (timer: TimerItem) => {
      // 本质上是触发 React 重新渲染，getNextRunDate 会基于当前 Date.now() 重新计算
      setRefreshKey(k => k + 1);
      showToast(`已校准: ${timer.name}`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-[70] p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl border border-gray-700 flex flex-col overflow-hidden max-h-[85vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
          <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                ⏳ 计时器管理中心
              </h3>
              <span className="bg-blue-900/30 text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-800">
                  共 {timers.length} 个调度
              </span>
          </div>
          <div className="flex items-center gap-4">
              {statusMsg && <span className="text-xs text-green-400 font-bold animate-pulse">{statusMsg}</span>}
              <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
            <div className="overflow-hidden rounded-lg border border-gray-700">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-900 text-gray-200 uppercase text-xs font-bold">
                        <tr>
                            <th className="p-3 pl-4">任务名称</th>
                            <th className="p-3">Cron 表达式</th>
                            <th className="p-3 text-center">计时器状态</th>
                            <th className="p-3">上次运行</th>
                            <th className="p-3">预计下次</th>
                            <th className="p-3 text-right pr-4">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-800/50">
                        {timers.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">暂无活动的定时任务</td>
                            </tr>
                        ) : (
                            timers.map(timer => (
                                <tr key={timer.id} className="hover:bg-gray-700/30 transition-colors group">
                                    <td className="p-3 pl-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full ${timer.type === 'system' ? 'bg-purple-400' : 'bg-blue-400'}`}></span>
                                            <span className="font-bold text-white">{timer.name}</span>
                                            {timer.tags.map(tag => (
                                                <span key={tag} className="text-[10px] px-1.5 rounded bg-gray-700 text-gray-300 border border-gray-600">{tag}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-3 font-mono text-yellow-500/80">{timer.cron}</td>
                                    <td className="p-3 text-center">
                                        <div className="flex justify-center">
                                            <ToggleSwitch 
                                                checked={timer.enabled} 
                                                onChange={(c) => handleToggle(timer, c)}
                                            />
                                        </div>
                                    </td>
                                    <td className="p-3 font-mono text-xs text-gray-500">
                                        {formatTime(timer.lastRun)}
                                    </td>
                                    <td className="p-3">
                                        {timer.enabled ? (
                                            <div className="flex flex-col">
                                                <span className="text-blue-300 font-bold font-mono text-xs">
                                                    {formatShortDate(timer.nextRun)}
                                                </span>
                                                {timer.nextRun && (
                                                    <span className="text-[10px] text-gray-500">
                                                        {formatDuration(timer.nextRun.getTime() - now, config.preciseCountdown)} 后
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-gray-600">-</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right pr-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => handleCalibrate(timer)}
                                                className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded border border-gray-600 transition-colors shadow-sm"
                                                title="重新计算预计时间"
                                            >
                                                校准
                                            </button>
                                            <button 
                                                onClick={() => handleReset(timer)}
                                                className="px-2 py-1.5 bg-red-900/30 hover:bg-red-900/60 text-red-300 text-xs rounded border border-red-800/50 transition-colors shadow-sm"
                                                title="重置上次运行时间"
                                            >
                                                重置
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/30 flex justify-between items-center">
            <div className="text-xs text-gray-500 max-w-xl space-y-1">
                <p><strong>• 状态：</strong> 此处的开关仅控制<strong>定时器</strong>是否激活，不会禁用账号本身。</p>
                <p><strong>• 重置：</strong> 强制将“上次运行”时间归零。如果当前时间符合 Cron 规则，任务将会在下次心跳时立即执行。</p>
            </div>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-colors text-sm">
                    关闭
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default TimerManagerModal;
