
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { Account, LogEntry, PointHistoryItem } from '../types';
import { formatTime } from '../utils/helpers';
import ToggleSwitch from './ToggleSwitch';

interface MonitorModalProps {
  account: Account | null;
  onClose: () => void;
  configLogDays?: number; 
}

interface DayGroup {
    date: string;
    points: number;
    diff: number;
    items: PointHistoryItem[];
}

type SpeedPreset = 'slow' | 'normal' | 'fast' | 'turbo' | 'instant';

const MonitorModal: React.FC<MonitorModalProps> = ({ account, onClose, configLogDays = 1 }) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'history'>('history');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [displayedLogs, setDisplayedLogs] = useState<LogEntry[]>([]);
  const [queue, setQueue] = useState<LogEntry[]>([]);
  const processingRef = useRef(false);
  
  // 速度控制状态
  const [speed, setSpeed] = useState<SpeedPreset>('normal');
  
  // 图表配置状态
  const [showXAxis, setShowXAxis] = useState(false);
  const [showChartSettings, setShowChartSettings] = useState(false);
  
  // 图表尺寸响应式状态
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 使用 Callback Ref 确保条件渲染时能正确捕获 DOM 并启动监听
  const setChartContainerRef = useCallback((node: HTMLDivElement | null) => {
      // 清理旧的 observer
      if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
      }

      if (node) {
          // 创建新的 observer
          resizeObserverRef.current = new ResizeObserver((entries) => {
              for (const entry of entries) {
                  const { width, height } = entry.contentRect;
                  // 使用 requestAnimationFrame 避免 "ResizeObserver loop limit exceeded" 错误
                  requestAnimationFrame(() => {
                      setChartDimensions({ width, height });
                  });
              }
          });
          resizeObserverRef.current.observe(node);
      }
  }, []);

  useEffect(() => {
      if (account) {
          setActiveTab('history'); 
          setExpandedDate(null);
      }
  }, [account?.id]);

  useEffect(() => {
    if (activeTab === 'logs' && account?.logs) {
        const now = new Date();
        const cutoffTime = new Date(now.setDate(now.getDate() - (configLogDays - 1)));
        cutoffTime.setHours(0,0,0,0);
        
        const filtered = account.logs.filter(l => l.timestamp >= cutoffTime.getTime());
        
        setDisplayedLogs([]);
        setQueue(filtered);
        processingRef.current = false;
    }
  }, [account?.id, activeTab, configLogDays]); 

  // 动态变速打字机
  useEffect(() => {
      if (queue.length === 0) return;
      if (processingRef.current) return;

      processingRef.current = true;
      let currentIndex = 0;

      const processNext = () => {
          if (currentIndex >= queue.length) {
              processingRef.current = false;
              return;
          }

          // 极速模式：一次性渲染所有剩余
          if (speed === 'instant') {
              setDisplayedLogs(prev => [...prev, ...queue.slice(currentIndex)]);
              currentIndex = queue.length;
              processingRef.current = false;
              return;
          }

          const remaining = queue.length - currentIndex;
          let chunkSize = 1;
          let delay = 50;

          // 根据预设速度调整基准延迟
          let baseDelay = 50;
          switch (speed) {
              case 'slow': baseDelay = 100; break;
              case 'normal': baseDelay = 30; break;
              case 'fast': baseDelay = 10; break;
              case 'turbo': baseDelay = 2; break;
          }

          // 动态调整 (队列积压时加速)
          if (remaining > 200) { chunkSize = 20; delay = Math.max(1, baseDelay / 10); }
          else if (remaining > 100) { chunkSize = 10; delay = Math.max(2, baseDelay / 5); }
          else if (remaining > 50) { chunkSize = 5; delay = Math.max(5, baseDelay / 2); }
          else { chunkSize = 1; delay = baseDelay; }

          const nextBatch = queue.slice(currentIndex, currentIndex + chunkSize);
          setDisplayedLogs(prev => [...prev, ...nextBatch]);
          currentIndex += chunkSize;

          setTimeout(processNext, delay);
      };

      processNext();

      return () => { processingRef.current = false; };
  }, [queue, speed]); // 依赖 speed 变化

  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
       scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [displayedLogs, activeTab]);

  if (!account) return null;

  const getAggregatedHistory = (rawHistory: PointHistoryItem[]): DayGroup[] => {
      const groups: { [key: string]: PointHistoryItem[] } = {};
      rawHistory.forEach(item => {
          const dateKey = new Date(item.date).toLocaleDateString(); 
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(item);
      });
      
      const dayKeys = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      
      return dayKeys.map((date, index) => {
          const items = groups[date];
          const lastPoints = items[items.length - 1].points;
          let diff = 0;
          if (index < dayKeys.length - 1) {
              const prevDate = dayKeys[index + 1];
              const prevItems = groups[prevDate];
              const prevPoints = prevItems[prevItems.length - 1].points;
              diff = lastPoints - prevPoints;
          }
          return { date, points: lastPoints, diff, items };
      });
  };

  const aggregatedHistory = getAggregatedHistory(account.pointHistory || []);

  const renderChart = (data: PointHistoryItem[]) => {
    if (data.length < 2) return <div className="text-gray-500 text-center py-10 flex items-center justify-center h-full">数据不足，无法生成图表</div>;

    // 使用 ResizeObserver 捕获的实际像素尺寸
    const { width, height } = chartDimensions;
    
    // 如果尺寸尚未初始化或过小，暂时不渲染或渲染占位
    if (width < 50 || height < 50) return null;

    const chartData = data.slice(-30);
    const chartDataWithDiff = chartData.map((d, i, arr) => {
        const prev = i > 0 ? arr[i-1] : d;
        return { ...d, diff: d.points - prev.points };
    });

    // 增加 paddingX，防止边缘点紧贴容器边界
    const paddingX = 20; 
    const paddingY = 60; // Bottom padding for X-axis labels

    const scores = chartData.map(d => d.points);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const rangeScore = maxScore - minScore || 1;

    const diffs = chartDataWithDiff.map(d => d.diff);
    const validDiffs = diffs.slice(1);
    const minDiff = Math.min(...validDiffs, 0);
    const maxDiff = Math.max(...validDiffs, 100);
    const rangeDiff = maxDiff - minDiff || 1;

    const getX = (i: number) => paddingX + (i / (chartData.length - 1)) * (width - paddingX * 2);
    const getY_Score = (val: number) => height - paddingY - ((val - minScore) / rangeScore) * (height - paddingY * 2);
    const getY_Diff = (val: number) => height - paddingY - ((val - minDiff) / rangeDiff) * (height - paddingY * 2) * 0.8; 

    const createPath = (getValue: (d: any) => number, getY: (v: number) => number) => {
        let path = `M ${getX(0)} ${getY(getValue(chartDataWithDiff[0]))}`;
        for (let i = 0; i < chartDataWithDiff.length - 1; i++) {
            const x0 = getX(i);
            const y0 = getY(getValue(chartDataWithDiff[i]));
            const x1 = getX(i + 1);
            const y1 = getY(getValue(chartDataWithDiff[i + 1]));
            const cp1x = x0 + (x1 - x0) / 2;
            const cp1y = y0;
            const cp2x = x0 + (x1 - x0) / 2;
            const cp2y = y1;
            path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x1} ${y1}`;
        }
        return path;
    };

    const dScore = createPath(d => d.points, getY_Score);
    const dDiff = createPath(d => d.diff, getY_Diff);
    const fillPath = `${dScore} L ${getX(chartData.length - 1)} ${height} L ${getX(0)} ${height} Z`;

    return (
      // 移除 preserveAspectRatio，直接使用计算出的 width/height 绘制
      // 这样文字大小 (fontSize) 不会被 SVG 缩放影响，始终保持原始像素大小
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/>
            </linearGradient>
        </defs>
        
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#374151" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} stroke="#374151" strokeWidth="1" strokeDasharray="4 4"/>
        
        <path d={fillPath} fill="url(#scoreGradient)" />
        <path d={dScore} fill="none" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={dDiff} fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 5" />
        
        <g transform="translate(60, 20)">
            <rect width="10" height="10" fill="#60A5FA" />
            <text x="15" y="10" fill="#9CA3AF" fontSize="12" fontWeight="bold">总积分 (Left)</text>
            <rect x="120" width="10" height="10" fill="#FBBF24" />
            <text x="135" y="10" fill="#9CA3AF" fontSize="12" fontWeight="bold">日增量 (Right)</text>
        </g>

        {/* X-Axis Labels (Dates) */}
        {showXAxis && chartDataWithDiff.map((d, i) => {
            // 只显示部分标签，避免重叠 (每4个显示一个，且总是显示最后一个)
            if (i % 4 !== 0 && i !== chartDataWithDiff.length - 1) return null;
            
            const x = getX(i);
            const dateStr = new Date(d.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
            
            return (
                <text 
                    key={`label-${i}`} 
                    x={x} 
                    y={height - 20} 
                    fill="#6B7280" 
                    fontSize="10" 
                    textAnchor="middle"
                    className="select-none"
                >
                    {dateStr}
                </text>
            );
        })}

        {chartDataWithDiff.map((d, i) => {
          const x = getX(i);
          const yS = getY_Score(d.points);
          const yD = getY_Diff(d.diff);
          const minY = Math.min(yS, yD);
          const isTooHigh = minY < 100;
          const tooltipY = isTooHigh ? minY + 20 : minY - 80;
          
          // 智能边界检测：防止 Tooltip 被容器裁剪
          // 默认偏移 -60 (居中)，最左侧偏移 -10 (偏右)，最右侧偏移 -110 (偏左)
          let tooltipX = x - 60;
          const isLeftEdge = x < 60;
          const isRightEdge = x > width - 60;
          
          if (isLeftEdge) tooltipX = x - 10;
          else if (isRightEdge) tooltipX = x - 110;

          // 小三角的位置 (相对于 foreignObject 内部坐标)
          const arrowLeft = isLeftEdge ? '15px' : isRightEdge ? '105px' : '50%';
          // 如果是右边缘，arrow需要调整位置
          const arrowTranslate = isLeftEdge || isRightEdge ? '0' : '-50%';

          return (
             <g key={i} className="group">
                <rect x={x-15} y={0} width={30} height={height} fill="transparent" />
                <circle cx={x} cy={yS} r="4" fill="#60A5FA" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                <circle cx={x} cy={yD} r="3" fill="#FBBF24" className="opacity-0 group-hover:opacity-100 transition-opacity" />
                <foreignObject x={tooltipX} y={tooltipY} width="120" height="75" className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 overflow-visible">
                   <div className={`flex flex-col ${isLeftEdge ? 'items-start' : isRightEdge ? 'items-end' : 'items-center'} justify-end h-full`}>
                       <div className="bg-gray-800/95 backdrop-blur text-white text-[10px] py-2 px-3 rounded-lg border border-gray-600 shadow-2xl text-left transform w-full relative">
                         <div className="text-gray-400 font-mono mb-1 text-center border-b border-gray-600/50 pb-1">{new Date(d.date).toLocaleDateString()}</div>
                         <div className="font-bold text-blue-300">Total: {d.points.toLocaleString()}</div>
                         <div className="font-bold text-yellow-300">Diff: +{d.diff}</div>
                         
                         {/* 动态箭头 */}
                         <div 
                            className={`absolute w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent ${isTooHigh ? 'border-b-[6px] border-b-gray-600 -top-1.5' : 'border-t-[6px] border-t-gray-600 -bottom-1.5'}`}
                            style={{ left: arrowLeft, transform: `translateX(${arrowTranslate})` }}
                         ></div>
                       </div>
                   </div>
                </foreignObject>
             </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4 transition-all duration-300" onClick={onClose}>
      <div className="bg-gray-900/90 rounded-xl shadow-2xl w-full max-w-5xl border border-gray-700 flex flex-col h-[85vh] overflow-hidden backdrop-blur-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-800/50 shrink-0">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold text-white">{account.name} <span className="text-gray-400 text-sm font-normal">监视器</span></h3>
            <div className="bg-blue-900/30 px-3 py-1 rounded border border-blue-800 text-blue-300 text-sm">
               当前积分: <span className="font-bold text-white">{account.totalPoints.toLocaleString() || '---'}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 p-2 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        <div className="flex border-b border-gray-800 bg-gray-900 shrink-0">
          <button onClick={() => setActiveTab('history')} className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'history' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
            积分趋势 (Trend)
          </button>
          <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === 'logs' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
            运行日志 (Console)
          </button>
        </div>

        <div className="flex-1 overflow-hidden relative bg-black/40 flex flex-col">
           {activeTab === 'logs' && (
             <>
             <div 
                ref={scrollContainerRef} 
                className="flex-1 overflow-y-auto p-4 custom-scrollbar font-mono text-sm flex flex-col"
             >
                <div className="flex-1"></div>
                {displayedLogs.length === 0 && queue.length === 0 ? (
                  <div className="text-center text-gray-600 pb-4">暂无今日日志记录</div>
                ) : (
                  <div className="space-y-1.5 pb-2">
                    {displayedLogs.map(log => (
                        <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors border-l-2 border-transparent hover:border-blue-500/30 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <span className="text-gray-500 shrink-0 select-none text-xs opacity-60">[{formatTime(log.timestamp)}]</span>
                        <span className={`break-all ${
                            log.type === 'error' ? 'text-red-400' : 
                            log.type === 'success' ? 'text-green-400' : 
                            log.type === 'warning' ? 'text-yellow-400' : 
                            log.type === 'risk' ? 'text-red-600 font-bold' : 'text-gray-300'
                        }`}>
                            {log.message}
                        </span>
                        </div>
                    ))}
                    {displayedLogs.length < queue.length && (
                        <div className="h-4 w-2 bg-blue-500 animate-pulse ml-2"></div>
                    )}
                  </div>
                )}
             </div>
             
             {/* 底部速度控制栏 */}
             <div className="bg-gray-900 border-t border-gray-800 p-2 flex items-center justify-end gap-2 shrink-0 select-none">
                 <span className="text-[10px] text-gray-500 font-bold uppercase mr-1">打印速度:</span>
                 <div className="flex bg-black/30 rounded-lg p-0.5 border border-gray-700">
                     {[
                         { id: 'slow', label: '慢速' },
                         { id: 'normal', label: '正常' },
                         { id: 'fast', label: '稍快' },
                         { id: 'turbo', label: '快速' },
                         { id: 'instant', label: '极速 (Instant)' }
                     ].map(opt => (
                         <button
                            key={opt.id}
                            onClick={() => setSpeed(opt.id as SpeedPreset)}
                            className={`px-3 py-1 text-[10px] rounded-md transition-all font-medium ${
                                speed === opt.id 
                                ? 'bg-blue-600 text-white shadow-sm' 
                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                            }`}
                         >
                             {opt.label}
                         </button>
                     ))}
                 </div>
             </div>
             </>
           )}

           {activeTab === 'history' && (
             // 重构布局：将 Chart 固定在顶部，将 Table 放在独立的滚动区域
             <div className="h-full flex flex-col overflow-hidden">
                {/* 1. 图表区域：动态高度 h-[35vh]，限制最小/最大高度，防止在小屏幕挤占表格 */}
                <div className="shrink-0 h-[35vh] min-h-[220px] max-h-[380px] bg-gray-800/30 border-b border-gray-700 p-4 relative flex flex-col">
                   <div className="absolute top-4 left-6 z-10 flex gap-4 items-center">
                       <h4 className="text-xs font-bold text-gray-500 uppercase">Trend Analysis (30 Days)</h4>
                   </div>
                   
                   {/* Chart Settings Button */}
                   <div className="absolute top-3 right-3 z-50">
                       <button 
                           onClick={() => setShowChartSettings(!showChartSettings)}
                           className={`p-1.5 rounded transition-all ${showChartSettings ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-700/50'}`}
                       >
                           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.533 1.533 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"></path></svg>
                       </button>
                       
                       {showChartSettings && (
                           <div className="absolute right-0 top-full mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100">
                               <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Chart Options</div>
                               <div className="flex items-center justify-between">
                                   <span className="text-xs text-gray-300">显示日期轴</span>
                                   <ToggleSwitch checked={showXAxis} onChange={setShowXAxis} />
                               </div>
                           </div>
                       )}
                   </div>

                   {/* 图表容器：使用 callback ref 来监听尺寸 */}
                   <div ref={setChartContainerRef} className="w-full h-full">
                        {renderChart(account.pointHistory)}
                   </div>
                </div>
                
                {/* 2. 独立的 Table 滚动区域 */}
                <div className="flex-1 flex flex-col p-6 min-h-0 bg-gray-900/20">
                  <h4 className="text-gray-400 text-sm mb-3 font-bold flex items-center gap-2 shrink-0">
                      <span className="w-1.5 h-4 bg-purple-500 rounded-full"></span>
                      每日结算记录
                  </h4>
                  
                  {/* 核心修复：
                      1. 使用 border-separate border-spacing-0 解决圆角问题
                      2. 使用 overflow-hidden + rounded-lg 在外层容器上实现圆角裁剪
                      3. 将 overflow-y-auto 放在此容器上，确保 sticky 是相对于此容器工作，从而完美被裁剪
                  */}
                  <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 select-none shadow-lg relative isolate overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-sm text-gray-400 border-separate border-spacing-0">
                        <thead className="text-gray-200 sticky top-0 z-30 bg-gray-800 shadow-sm">
                            <tr>
                            {/* 强制高度 h-[45px] 以配合下方 sticky 的 top-[44px]，消除间隙 */}
                            <th className="p-3 pl-4 border-b border-gray-700 bg-gray-800 h-[45px]">日期</th>
                            <th className="p-3 border-b border-gray-700 bg-gray-800 h-[45px]">当日结余</th>
                            <th className="p-3 border-b border-gray-700 bg-gray-800 h-[45px]">日变化</th>
                            </tr>
                        </thead>
                        <tbody>
                            {aggregatedHistory.length === 0 ? (
                                <tr><td colSpan={3} className="p-4 text-center text-gray-600">暂无历史数据</td></tr>
                            ) : (
                                aggregatedHistory.map((h, i) => {
                                    const isExpanded = expandedDate === h.date;
                                    return (
                                    <React.Fragment key={h.date}>
                                        <tr 
                                            onClick={() => setExpandedDate(isExpanded ? null : h.date)}
                                            className={`
                                                transition-all cursor-pointer group relative
                                                ${isExpanded 
                                                    // top-[44px] 产生 1px 重叠，完美覆盖上一行的 border，消除视觉缝隙
                                                    ? 'sticky top-[44px] z-20 shadow-md bg-gray-750' 
                                                    : 'hover:bg-gray-700/50 bg-gray-800'
                                                }
                                            `}
                                        >
                                            <td className={`p-3 pl-4 font-mono flex items-center gap-2 border-b border-gray-700 ${isExpanded ? 'border-gray-600' : ''}`}>
                                                <span className={`transform transition-transform text-gray-500 text-xs ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                {new Date(h.date).toLocaleDateString()}
                                            </td>
                                            <td className={`p-3 font-bold text-white font-mono tracking-wide border-b border-gray-700 ${isExpanded ? 'border-gray-600' : ''}`}>
                                                {h.points.toLocaleString()}
                                            </td>
                                            <td className={`p-3 font-mono font-bold border-b border-gray-700 ${isExpanded ? 'border-gray-600' : ''} ${h.diff > 0 ? 'text-green-400' : h.diff < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                                                {h.diff > 0 ? `+${h.diff}` : h.diff === 0 ? '-' : h.diff}
                                            </td>
                                        </tr>
                                        
                                        {isExpanded && (
                                            <tr className="bg-black/20">
                                                <td colSpan={3} className="p-0 border-b border-gray-700">
                                                    <div className="p-3 pl-10 space-y-1 animate-in slide-in-from-top-2 fade-in duration-200">
                                                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">当日详细记录 (UTC Local Time)</div>
                                                        {h.items.map((detail, idx) => (
                                                            <div key={idx} className="flex justify-between text-xs font-mono text-gray-400 border-b border-gray-700/30 last:border-0 pb-1 mb-1">
                                                                <span>{new Date(detail.date).toLocaleTimeString()}</span>
                                                                <span className="text-blue-300">{detail.points.toLocaleString()}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                        </table>
                    </div>
                  </div>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default MonitorModal;
