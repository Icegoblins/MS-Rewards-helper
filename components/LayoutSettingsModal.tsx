
import React, { useState } from 'react';
import { AppConfig } from '../types';
import CustomSelect from './CustomSelect';
import ToggleSwitch from './ToggleSwitch';

interface LayoutSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
  visibleWidgets: { [key: string]: boolean };
  onToggleWidget: (key: string, visible: boolean) => void;
}

const LayoutSettingsModal: React.FC<LayoutSettingsModalProps> = ({ isOpen, onClose, config, onUpdateConfig, visibleWidgets, onToggleWidget }) => {
  const [activeTab, setActiveTab] = useState<'layout' | 'widgets' | 'appearance'>('layout');

  if (!isOpen) return null;

  const tabs = [
      { id: 'layout', label: '布局 Layout' },
      { id: 'widgets', label: '组件 Widgets' },
      { id: 'appearance', label: '外观 Style' }
  ];

  const activeIndex = tabs.findIndex(t => t.id === activeTab);

  const gridOptions = [
      { label: '自动适应 (Responsive)', value: '0' },
      { label: '强制 1 列', value: '1' },
      { label: '强制 2 列', value: '2' },
      { label: '强制 3 列', value: '3' },
      { label: '强制 4 列', value: '4' },
      { label: '强制 5 列', value: '5' },
  ];

  const fontOptions = [
      { label: '小 (Small)', value: 'text-xl' },
      { label: '中 (Medium)', value: 'text-2xl' },
      { label: '大 (Large)', value: 'text-3xl' },
      { label: '特大 (XL)', value: 'text-4xl' },
      { label: '巨大 (2XL)', value: 'text-5xl' },
  ];

  const changeFontSize = (type: 'totalPoints' | 'dailyChange', val: string) => {
      onUpdateConfig(prev => ({
          ...prev,
          cardFontSizes: {
              ...(prev.cardFontSizes || { totalPoints: 'text-3xl', dailyChange: 'text-2xl' }),
              [type]: val
          }
      }));
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-[80] p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            🏗️ 布局调整
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Tab Bar */}
        <div className="px-6 pt-4 pb-2 bg-gray-900/30">
            <div className="relative flex bg-black/40 p-1 rounded-xl border border-gray-700/50">
                <div 
                    className="absolute top-1 bottom-1 bg-blue-600 rounded-lg shadow-md transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
                    style={{ 
                        left: `calc(${activeIndex * 33.33}% + 4px)`, 
                        width: `calc(33.33% - 8px)` 
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
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
            
            {activeTab === 'layout' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">账号卡片排列</label>
                        <div className="bg-black/20 p-3 rounded-lg border border-gray-700">
                            <CustomSelect 
                                value={config.gridCols?.toString() || '0'}
                                options={gridOptions}
                                onChange={(val) => onUpdateConfig(prev => ({...prev, gridCols: Number(val)}))}
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">间距与边距</label>
                        <div className="bg-black/20 p-3 rounded-lg border border-gray-700 space-y-4">
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                    <span>卡片间距 (Gap)</span>
                                    <span className="font-mono text-blue-400">{config.layoutGap || 6}</span>
                                </div>
                                <input 
                                    type="range" min="2" max="16" step="1" 
                                    value={config.layoutGap || 6}
                                    onChange={(e) => onUpdateConfig(prev => ({...prev, layoutGap: Number(e.target.value)}))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                    <span>页面内边距 (Padding)</span>
                                    <span className="font-mono text-blue-400">{config.containerPadding || 8}</span>
                                </div>
                                <input 
                                    type="range" min="4" max="24" step="2" 
                                    value={config.containerPadding || 8}
                                    onChange={(e) => onUpdateConfig(prev => ({...prev, containerPadding: Number(e.target.value)}))}
                                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'widgets' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">顶部栏元素显示</label>
                        <div className="bg-black/20 rounded-lg border border-gray-700 divide-y divide-gray-700/50">
                            <div className="flex items-center justify-between p-3">
                                <span className="text-sm text-gray-300">积分总池</span>
                                <ToggleSwitch checked={visibleWidgets['total_pool']} onChange={(v) => onToggleWidget('total_pool', v)} />
                            </div>
                            <div className="flex items-center justify-between p-3">
                                <span className="text-sm text-gray-300">任务倒计时</span>
                                <ToggleSwitch checked={visibleWidgets['cron_timer']} onChange={(v) => onToggleWidget('cron_timer', v)} />
                            </div>
                            <div className="flex items-center justify-between p-3">
                                <span className="text-sm text-gray-300">本地自动备份</span>
                                <ToggleSwitch checked={visibleWidgets['local_backup']} onChange={(v) => onToggleWidget('local_backup', v)} />
                            </div>
                            <div className="flex items-center justify-between p-3">
                                <span className="text-sm text-gray-300">云同步状态 (坚果云/Infini)</span>
                                <ToggleSwitch checked={visibleWidgets['cloud_sync']} onChange={(v) => onToggleWidget('cloud_sync', v)} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'appearance' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">卡片数值字体大小</label>
                        <div className="bg-black/20 p-3 rounded-lg border border-gray-700 grid grid-cols-2 gap-3">
                            <CustomSelect 
                                label="当前积分 (Main)"
                                value={config.cardFontSizes?.totalPoints || 'text-3xl'}
                                options={fontOptions}
                                onChange={(val) => changeFontSize('totalPoints', val)}
                            />
                            <CustomSelect 
                                label="较昨日变化 (Diff)"
                                value={config.cardFontSizes?.dailyChange || 'text-2xl'}
                                options={fontOptions}
                                onChange={(val) => changeFontSize('dailyChange', val)}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">时钟位置</label>
                        <div className="flex bg-black/40 p-1 rounded-lg border border-gray-600">
                            <button 
                                onClick={() => onUpdateConfig(prev => ({...prev, clockPosition: 'left'}))}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${config.clockPosition === 'left' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                                左侧 (Left)
                            </button>
                            <button 
                                onClick={() => onUpdateConfig(prev => ({...prev, clockPosition: 'right'}))}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${config.clockPosition === 'right' ? 'bg-gray-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
                            >
                                右侧 (Right)
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/30 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-colors text-sm">
                完成
            </button>
        </div>
      </div>
    </div>
  );
};

export default LayoutSettingsModal;
