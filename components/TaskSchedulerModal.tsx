
import React from 'react';
import { AppConfig } from '../types';
import CronGeneratorModal from './CronGeneratorModal';
import ToggleSwitch from './ToggleSwitch';

interface TaskSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
}

const TaskSchedulerModal: React.FC<TaskSchedulerModalProps> = ({ isOpen, onClose, config, onUpdateConfig }) => {
  const [showCronGen, setShowCronGen] = React.useState(false);

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border border-gray-700 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            ⏱️ 任务调度 (Crontab)
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
            <div className="bg-gray-900/30 border border-gray-600/30 rounded-lg p-4">
                <p className="text-sm text-gray-300 mb-4">
                    此配置控制首页“一键启动”按钮的自动执行频率。
                </p>
                <div className="flex items-center justify-between bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                    <span className="text-sm font-bold text-gray-200">启用自动调度</span>
                    <ToggleSwitch 
                        checked={config.cron?.enabled || false}
                        onChange={(checked) => onUpdateConfig(c => ({...c, cron: {...c.cron!, enabled: checked} }))}
                    />
                </div>
            </div>

            <div className={`space-y-3 transition-opacity ${config.cron?.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-gray-400 uppercase">Cron 表达式</label>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="* * * * *" 
                            value={config.cron?.cronExpression || ''} 
                            onChange={(e) => onUpdateConfig(c => ({...c, cron: {...c.cron!, cronExpression: e.target.value} }))} 
                            className="flex-1 bg-black/40 border border-gray-600 rounded-lg px-4 py-2 text-center font-mono text-blue-300 focus:border-blue-500 outline-none text-sm" 
                        />
                        <button onClick={() => setShowCronGen(true)} className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-4 rounded-lg border border-gray-600 transition-colors font-bold">
                            生成
                        </button>
                    </div>
                </div>
                <p className="text-xs text-gray-500">* 建议设置为每日凌晨 (如 0 4 * * *) 以避免高峰期拥堵。</p>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 bg-gray-900/30 flex justify-end">
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg transition-colors text-sm">
                保存并关闭
            </button>
        </div>
      </div>
    </div>
    
    <CronGeneratorModal 
        isOpen={showCronGen} 
        onClose={() => setShowCronGen(false)} 
        onApply={(expr) => onUpdateConfig(c => ({...c, cron: {...c.cron!, cronExpression: expr}}))} 
    />
    </>
  );
};

export default TaskSchedulerModal;
