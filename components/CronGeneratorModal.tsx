
import React, { useState, useEffect, useRef } from 'react';

interface CronGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (expression: string) => void;
}

// 1. 紧凑型滚轮选择器 (用于每日定点)
const WheelPicker = ({ items, value, onChange, label, isOpen }: { items: string[], value: number, onChange: (val: number) => void, label?: string, isOpen: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInternalScroll = useRef(false); 
  const itemHeight = 32; // 缩小高度

  useEffect(() => {
    if (containerRef.current) {
       const targetTop = value * itemHeight;
       if (isOpen) {
           containerRef.current.scrollTo({ top: targetTop, behavior: 'auto' });
       } 
    }
  }, [isOpen]); 

  useEffect(() => {
      if (containerRef.current && !isInternalScroll.current) {
          containerRef.current.scrollTo({ top: value * itemHeight, behavior: 'smooth' });
      }
      isInternalScroll.current = false;
  }, [value]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const index = Math.round(scrollTop / itemHeight);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
    
    if (clampedIndex !== value) {
      isInternalScroll.current = true;
      onChange(clampedIndex);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 relative z-0 group">
      {label && <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>}
      <div className="relative h-[160px] w-16 overflow-hidden bg-gray-900/50 rounded-lg border border-gray-700 shadow-inner">
         <style>{`
           .no-scrollbar::-webkit-scrollbar { display: none; }
           .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
         `}</style>

         {/* Selection Highlight */}
         <div className="absolute top-[64px] left-0 right-0 h-[32px] bg-blue-500/10 border-y border-blue-500/50 pointer-events-none z-10 backdrop-blur-[1px]"></div>
         <div className="absolute inset-x-0 top-0 h-[64px] bg-gradient-to-b from-gray-900 via-gray-900/80 to-transparent pointer-events-none z-20"></div>
         <div className="absolute inset-x-0 bottom-0 h-[64px] bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent pointer-events-none z-20"></div>
         
         <div 
           ref={containerRef}
           className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory py-[64px]" 
           onScroll={handleScroll}
         >
            {items.map((item, i) => (
               <div 
                 key={i} 
                 onClick={() => {
                    if (i !== value) {
                        isInternalScroll.current = false;
                        onChange(i);
                    }
                 }}
                 className={`h-[32px] flex items-center justify-center snap-center cursor-pointer select-none transition-all duration-300 ease-out ${
                    value === i 
                    ? 'text-white font-bold text-xl scale-110 drop-shadow-md' 
                    : Math.abs(value - i) === 1 ? 'text-gray-500 text-xs' : 'text-gray-800 text-[10px] opacity-20'
                 }`}
               >
                  {item}
               </div>
            ))}
         </div>
      </div>
    </div>
  );
};

// 2. 迷你步进器 (用于循环间隔的时间选择)
const MiniStepper = ({ value, min, max, onChange, label, suffix }: { value: number, min: number, max: number, onChange: (val: number) => void, label: string, suffix: string }) => {
    return (
        <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold text-gray-500 uppercase">{label}</span>
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1 border border-gray-700">
                <button onClick={() => onChange(Math.max(min, value - 1))} className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center transition-colors">
                    -
                </button>
                <div className="w-8 text-center text-sm font-bold text-white font-mono">
                    {value.toString().padStart(2, '0')}
                </div>
                <button onClick={() => onChange(Math.min(max, value + 1))} className="w-6 h-6 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 flex items-center justify-center transition-colors">
                    +
                </button>
            </div>
        </div>
    )
}

const CronGeneratorModal: React.FC<CronGeneratorModalProps> = ({ isOpen, onClose, onApply }) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'interval'>('daily');
  
  // State
  const [hour, setHour] = useState(4);
  const [minute, setMinute] = useState(0);
  const [dayOfMonth, setDayOfMonth] = useState(1); // 新增：月间隔时的日选择
  const [intervalType, setIntervalType] = useState<'hour' | 'minute' | 'day' | 'month'>('day');
  const [intervalValue, setIntervalValue] = useState(1);

  const [result, setResult] = useState('');
  const [desc, setDesc] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const hoursList = Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
  const minutesList = Array.from({length: 60}, (_, i) => i.toString().padStart(2, '0'));

  const getMaxInterval = (type: string) => {
      switch(type) {
          case 'minute': return 59;
          case 'hour': return 23;
          case 'day': return 31;
          case 'month': return 12;
          default: return 60;
      }
  };

  useEffect(() => {
    let expr = '';
    let description = '';
    
    // 补零函数
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (activeTab === 'daily') {
        expr = `${minute} ${hour} * * *`;
        description = `每天 ${pad(hour)}:${pad(minute)} 执行`;
    } else {
        const val = Math.max(1, intervalValue);
        switch (intervalType) {
            case 'minute':
                expr = `*/${val} * * * *`;
                description = `每 ${val} 分钟`;
                break;
            case 'hour':
                // Hour 模式下，分钟通常固定为0
                expr = `0 */${val} * * *`;
                description = `每 ${val} 小时 (整点)`;
                break;
            case 'day':
                // 支持自定义执行时间
                expr = `${minute} ${hour} */${val} * *`;
                description = `每 ${val} 天 (${pad(hour)}:${pad(minute)})`;
                break;
            case 'month':
                // 支持自定义执行时间和日期
                expr = `${minute} ${hour} ${dayOfMonth} */${val} *`;
                description = `每 ${val} 个月 (${dayOfMonth}号 ${pad(hour)}:${pad(minute)})`;
                break;
        }
    }
    setResult(expr);
    setDesc(description);
  }, [activeTab, hour, minute, dayOfMonth, intervalType, intervalValue]);

  const handleCopy = async () => {
      try {
          await navigator.clipboard.writeText(result);
          setCopyStatus('已复制');
          setTimeout(() => setCopyStatus(''), 2000);
      } catch (e) {
          setCopyStatus('失败');
      }
  };

  const handleApply = () => {
      onApply(result);
      onClose();
  };

  useEffect(() => {
     const max = getMaxInterval(intervalType);
     if (intervalValue > max) setIntervalValue(1);
  }, [intervalType]);

  if (!isOpen) return null;

  // 渲染 Time Picker (用于 Interval 模式的 Day/Month)
  const renderTimePickerForInterval = () => {
      if (intervalType === 'minute' || intervalType === 'hour') return null;
      return (
          // 修改布局：flex-wrap 和 gap，防止截断
          <div className="flex flex-wrap justify-center items-end gap-3 mt-4 bg-black/20 p-2 rounded-lg border border-gray-700/50 animate-in fade-in slide-in-from-bottom-2 w-full">
              <div className="w-full text-center mb-1">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">Trigger At:</span>
              </div>
              
              {/* 如果是月模式，显示日期选择器 */}
              {intervalType === 'month' && (
                  <>
                    <MiniStepper value={dayOfMonth} min={1} max={31} onChange={setDayOfMonth} label="Day" suffix="" />
                    <div className="text-gray-600 font-bold mb-2 hidden sm:block">/</div>
                  </>
              )}

              <MiniStepper value={hour} min={0} max={23} onChange={setHour} label="Hour" suffix="H" />
              <div className="text-gray-600 font-bold mb-2 hidden sm:block">:</div>
              <MiniStepper value={minute} min={0} max={59} onChange={setMinute} label="Min" suffix="M" />
          </div>
      );
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-[100] p-4 transition-opacity duration-300" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm border border-gray-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-800/50">
          <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
              <h3 className="text-lg font-bold text-gray-100 tracking-wide">任务频率</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1 rounded-md hover:bg-gray-700">✕</button>
        </div>

        {/* Tabs */}
        <div className="p-6 pb-2">
            <div className="flex bg-black/40 p-1 rounded-xl border border-gray-800 relative">
                <button onClick={() => setActiveTab('daily')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-300 z-10 ${activeTab === 'daily' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>每日定点</button>
                <button onClick={() => setActiveTab('interval')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all duration-300 z-10 ${activeTab === 'interval' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}>循环间隔</button>
            </div>
        </div>

        {/* Content Area */}
        <div className="px-6 py-4 min-h-[240px] flex flex-col justify-center">
            {activeTab === 'daily' ? (
                <div className="flex items-center justify-center gap-4 animate-in fade-in slide-in-from-right-4 duration-300">
                    <WheelPicker items={hoursList} value={hour} onChange={setHour} label="时 (HOUR)" isOpen={isOpen} />
                    <div className="text-gray-600 text-xl font-bold pb-2">:</div>
                    <WheelPicker items={minutesList} value={minute} onChange={setMinute} label="分 (MIN)" isOpen={isOpen} />
                </div>
            ) : (
                <div className="flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-300 w-full">
                    {/* Unit Toggle */}
                    <div className="flex items-center gap-2 w-full justify-center mb-6">
                         <span className="text-xs font-bold text-gray-500 uppercase shrink-0 mr-1">单位</span>
                         <div className="grid grid-cols-4 gap-1 bg-gray-800 rounded-lg p-1 border border-gray-700 w-full">
                             {['minute', 'hour', 'day', 'month'].map(type => (
                                 <button key={type} onClick={() => setIntervalType(type as any)} className={`py-1.5 rounded text-xs font-bold transition-all ${intervalType === type ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}>
                                    {type === 'minute' ? '分' : type === 'hour' ? '时' : type === 'day' ? '天' : '月'}
                                 </button>
                             ))}
                         </div>
                    </div>

                    {/* Stepper (Main) */}
                    <div className="flex items-center gap-6 mb-2">
                        <button onClick={() => setIntervalValue(v => Math.max(1, v - 1))} className="w-10 h-10 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-gray-300 hover:bg-gray-700 hover:text-white hover:border-gray-500 hover:scale-105 active:scale-95 transition-all shadow-lg">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4"></path></svg>
                        </button>
                        <div className="flex flex-col items-center w-20">
                           <span className="text-4xl font-bold text-white font-mono tracking-tighter">{intervalValue}</span>
                           <span className="text-[10px] text-purple-400 font-bold mt-1 uppercase">
                               {intervalType === 'day' ? 'Days' : intervalType === 'month' ? 'Months' : intervalType === 'hour' ? 'Hours' : 'Mins'}
                           </span>
                        </div>
                        <button onClick={() => setIntervalValue(v => Math.min(getMaxInterval(intervalType), v + 1))} className="w-10 h-10 rounded-full bg-gray-800 border border-gray-600 flex items-center justify-center text-gray-300 hover:bg-gray-700 hover:text-white hover:border-gray-500 hover:scale-105 active:scale-95 transition-all shadow-lg">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                        </button>
                    </div>

                    {/* Description & Mini Time Picker */}
                    <div className="w-full flex flex-col items-center justify-center mt-2">
                        {renderTimePickerForInterval()}
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="bg-black/20 p-4 border-t border-gray-800 flex flex-col gap-3">
            <div className="flex justify-between items-end px-2">
                <span className="text-[10px] text-gray-500 font-bold uppercase">Result</span>
                <span className={`text-sm font-mono font-bold ${activeTab === 'daily' ? 'text-blue-400' : 'text-purple-400'}`}>{desc}</span>
            </div>
            <div className="flex gap-3">
                <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 flex items-center px-3 relative group">
                    <code className="text-sm font-mono text-gray-300 flex-1 text-center py-2">{result}</code>
                    <button onClick={handleCopy} className="absolute right-1 top-1 bottom-1 px-2 hover:bg-gray-700 rounded text-gray-500 hover:text-white transition-colors" title="复制">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                    {copyStatus && <span className="absolute left-1/2 -translate-x-1/2 -top-8 bg-gray-700 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in">{copyStatus}</span>}
                </div>
                <button onClick={handleApply} className={`px-6 py-2 rounded-lg font-bold text-sm text-white shadow-lg transition-all hover:scale-105 active:scale-95 ${activeTab === 'daily' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'}`}>
                    应用
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};

export default CronGeneratorModal;
