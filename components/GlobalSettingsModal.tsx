
import React, { useState } from 'react';
import { AppConfig } from '../types';
import ToggleSwitch from './ToggleSwitch';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
}

const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({ isOpen, onClose, config, onUpdateConfig }) => {
  const [activeTab, setActiveTab] = useState<'ui' | 'network' | 'strategy' | 'storage'>('ui');

  if (!isOpen) return null;

  const tabs = [
      { id: 'ui', label: '界面 UI' },
      { id: 'network', label: '网络 Net' },
      { id: 'strategy', label: '策略 Strategy' },
      { id: 'storage', label: '存储 Data' }
  ];

  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-[60] p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            ⚙️ 全局配置
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 bg-gray-900/30">
            <div className="relative flex bg-black/40 p-1 rounded-xl border border-gray-700/50">
                <div 
                    className="absolute top-1 bottom-1 bg-blue-600 rounded-lg shadow-md transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
                    style={{ 
                        left: `calc(${activeIndex * 25}% + 4px)`, 
                        width: `calc(25% - 8px)` 
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

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-[300px]">
            {activeTab === 'ui' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-300 font-medium">功能按钮高亮背景</label>
                            <ToggleSwitch 
                                checked={config.showButtonHighlight || false} 
                                onChange={(checked) => onUpdateConfig(prev => ({...prev, showButtonHighlight: checked}))}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <label className="text-sm text-gray-300 font-medium">强制统一指示灯颜色 (绿色)</label>
                            <ToggleSwitch 
                                checked={config.forceGreenIndicators || false} 
                                onChange={(checked) => onUpdateConfig(prev => ({...prev, forceGreenIndicators: checked}))}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-300 font-medium">Geek Mode (精确倒计时)</label>
                                <span className="text-[10px] text-gray-500">将倒计时转换为纯时分秒显示 (Total Hours)</span>
                            </div>
                            <ToggleSwitch 
                                checked={config.preciseCountdown || false} 
                                onChange={(checked) => onUpdateConfig(prev => ({...prev, preciseCountdown: checked}))}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm text-gray-300 font-medium flex justify-between">
                                <span>配置卡片自动关闭 (秒)</span>
                                <span className="text-xs text-gray-500 font-normal">0 = 禁用</span>
                            </label>
                            <input 
                                type="number" 
                                min="0"
                                value={config.editModeAutoCloseDelay ?? 30} 
                                onChange={(e) => onUpdateConfig(prev => ({...prev, editModeAutoCloseDelay: Number(e.target.value)}))} 
                                className="w-full bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-center text-white focus:border-blue-500 outline-none" 
                            />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'network' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-2">
                        <label className="text-sm text-gray-300 font-medium">代理服务地址 (Proxy URL)</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={config.proxyUrl} 
                                onChange={(e) => onUpdateConfig(prev => ({...prev, proxyUrl: e.target.value}))} 
                                className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2.5 text-sm text-white font-mono focus:border-blue-500 outline-none" 
                                placeholder="http://127.0.0.1:3001"
                            />
                            <div className="absolute right-3 top-2.5 text-xs text-gray-500 pointer-events-none">Recommend</div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">本地服务: <code>http://127.0.0.1:3001</code> (默认)</p>
                    </div>
                </div>
            )}

            {activeTab === 'strategy' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-300 font-medium">允许单任务推送</label>
                                <span className="text-[10px] text-gray-500">单独运行账号时是否发送通知 (批量运行时总会合并推送)</span>
                            </div>
                            <ToggleSwitch 
                                checked={config.allowSinglePush !== false} // 默认为 true
                                onChange={(checked) => onUpdateConfig(prev => ({...prev, allowSinglePush: checked}))}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <label className="text-sm text-gray-300 font-medium">跳过已完成账号 (每日签到)</label>
                                <span className="text-[10px] text-gray-500">一键启动时，自动跳过今日已运行成功的账号</span>
                            </div>
                            <ToggleSwitch 
                                checked={config.skipDailyCompleted || false} 
                                onChange={(checked) => onUpdateConfig(prev => ({...prev, skipDailyCompleted: checked}))}
                            />
                        </div>

                        <div className="h-[1px] bg-gray-700/50"></div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm text-gray-300 font-medium">账号间歇 (秒)</label>
                                <input 
                                    type="number" 
                                    value={config.delayBetweenAccounts} 
                                    onChange={(e) => onUpdateConfig(prev => ({...prev, delayBetweenAccounts: Number(e.target.value)}))} 
                                    className="w-full bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-center text-white focus:border-purple-500 outline-none" 
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm text-gray-300 font-medium">任务内随机延迟 (秒)</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number" 
                                        value={config.minDelay} 
                                        onChange={(e) => onUpdateConfig(prev => ({...prev, minDelay: Number(e.target.value)}))} 
                                        className="w-full bg-black/40 border border-gray-600 rounded-lg px-2 py-2 text-center text-white focus:border-purple-500 outline-none" 
                                    />
                                    <span className="text-gray-500">-</span>
                                    <input 
                                        type="number" 
                                        value={config.maxDelay} 
                                        onChange={(e) => onUpdateConfig(prev => ({...prev, maxDelay: Number(e.target.value)}))} 
                                        className="w-full bg-black/40 border border-gray-600 rounded-lg px-2 py-2 text-center text-white focus:border-purple-500 outline-none" 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <div className="space-y-2">
                                <label className="text-sm text-gray-300 font-medium">完成后转闲置 (分)</label>
                                <input 
                                    type="number" 
                                    value={config.autoIdleDelay ?? 5} 
                                    onChange={(e) => onUpdateConfig(prev => ({...prev, autoIdleDelay: Number(e.target.value)}))} 
                                    className="w-full bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-center text-white focus:border-purple-500 outline-none" 
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm text-gray-300 font-medium">监控日志保留 (天)</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    max="30"
                                    value={config.monitorLogDays ?? 1} 
                                    onChange={(e) => onUpdateConfig(prev => ({...prev, monitorLogDays: Number(e.target.value)}))} 
                                    className="w-full bg-black/40 border border-gray-600 rounded-lg px-3 py-2 text-center text-white focus:border-purple-500 outline-none" 
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'storage' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                     <div className="space-y-2">
                        <label className="text-sm text-gray-300 font-medium">本地备份文件夹 (Local Backup Path)</label>
                        <input 
                            type="text" 
                            value={config.localBackupPath || 'backups'} 
                            onChange={(e) => onUpdateConfig(prev => ({...prev, localBackupPath: e.target.value}))} 
                            className="w-full bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white font-mono focus:border-green-500 outline-none" 
                            placeholder="backups"
                        />
                        <p className="text-xs text-gray-500">* 此路径是相对于 local_proxy.js 的相对路径。</p>
                    </div>
                </div>
            )}
        </div>

        <div className="p-4 border-t border-gray-700 bg-gray-900/30 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-colors text-sm">
                完成设置
            </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalSettingsModal;
