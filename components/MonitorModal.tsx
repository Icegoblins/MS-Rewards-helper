
import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { Account, LogEntry, PointHistoryItem, AppConfig } from '../types';
import { formatTime } from '../utils/helpers';
import ToggleSwitch from './ToggleSwitch';

interface MonitorModalProps {
  account: Account | null;
  onClose: () => void;
  config: AppConfig;
  onUpdateConfig: (newConfig: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
}

interface DayGroup {
    date: string; // YYYY-MM-DD (Local Date String)
    timestamp: number;
    points: number; // 当天最后一次记录的积分
    diff: number;   // 当天最后积分 - 前一天最后积分
    items: PointHistoryItem[];
    isGap?: boolean; // 标记是否为自动填充的空缺日
}

type SpeedPreset = 'slow' | 'normal' | 'fast' | 'turbo' | 'instant';
type DateRange = 7 | 15 | 30 | 0; // 0 = All

const MonitorModal: React.FC<MonitorModalProps> = ({ account, onClose, config, onUpdateConfig }) => {
  const [activeTab, setActiveTab] = useState<'logs' | 'history'>('history');
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [displayedLogs, setDisplayedLogs] = useState<LogEntry[]>([]);
  const [queue, setQueue] = useState<LogEntry[]>([]);
  const processingRef = useRef(false);
  
  // 速度控制状态 (Logs 速度暂不持久化，因为属于临时调试需求)
  const [speed, setSpeed] = useState<SpeedPreset>('normal');
  
  // 图表配置 - 直接从全局 Config 读取
  const [showChartSettings, setShowChartSettings] = useState(false);
  
  const chartConfig = config.monitorChartConfig || {
      showPoints: true,
      showGridLines: true,
      showLabels: false,
      dateRange: 30
  };

  const updateChartConfig = (updates: Partial<typeof chartConfig>) => {
      onUpdateConfig(prev => ({
          ...prev,
          monitorChartConfig: {
              ...(prev.monitorChartConfig || {
                  showPoints: true,
                  showGridLines: true,
                  showLabels: false,
                  dateRange: 30
              }),
              ...updates
          }
      }));
  };
  
  // 图表尺寸响应式状态
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const setChartContainerRef = useCallback((node: HTMLDivElement | null) => {
      if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
          resizeObserverRef.current = null;
      }
      if (node) {
          resizeObserverRef.current = new ResizeObserver((entries) => {
              for (const entry of entries) {
                  const { width, height } = entry.contentRect;
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
        const logDays = config.monitorLogDays || 1;
        const now = new Date();
        const cutoffTime = new Date(now.setDate(now.getDate() - (logDays - 1)));
        cutoffTime.setHours(0,0,0,0);
        
        const filtered = account.logs.filter(l => l.timestamp >= cutoffTime.getTime());
        
        setDisplayedLogs([]);
        setQueue(filtered);
        processingRef.current = false;
    }
  }, [account?.id, activeTab, config.monitorLogDays]); 

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

          if (speed === 'instant') {
              setDisplayedLogs(prev => [...prev, ...queue.slice(currentIndex)]);
              currentIndex = queue.length;
              processingRef.current = false;
              return;
          }

          const remaining = queue.length - currentIndex;
          let chunkSize = 1;
          let delay = 50;
          let baseDelay = 50;
          switch (speed) {
              case 'slow': baseDelay = 100; break;
              case 'normal': baseDelay = 30; break;
              case 'fast': baseDelay = 10; break;
              case 'turbo': baseDelay = 2; break;
          }

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
  }, [queue, speed]);

  useLayoutEffect(() => {
    if (scrollContainerRef.current) {
       scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [displayedLogs, activeTab]);

  if (!account) return null;

  // 核心逻辑：数据按天聚合 (支持 Gap Filling - 自动填补缺失日期)
  const getAggregatedHistory = (rawHistory: PointHistoryItem[]): DayGroup[] => {
      if (!rawHistory || rawHistory.length === 0) return [];

      // 1. 按时间升序排序
      const sortedRaw = [...rawHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 2. 按本地日期分组 (YYYY-MM-DD)
      const groups: { [key: string]: PointHistoryItem[] } = {};
      sortedRaw.forEach(item => {
          const d = new Date(item.date);
          const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (!groups[dateKey]) groups[dateKey] = [];
          groups[dateKey].push(item);
      });

      // 3. 获取日期范围 (Start -> End)
      const existingDates = Object.keys(groups).sort(); 
      if (existingDates.length === 0) return [];

      const startParts = existingDates[0].split('-').map(Number);
      const endParts = existingDates[existingDates.length - 1].split('-').map(Number);
      
      // 使用本地时间中午 12 点以避免 DST 问题
      const cursor = new Date(startParts[0], startParts[1] - 1, startParts[2], 12, 0, 0);
      const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2], 12, 0, 0);
      
      const denseGroups: DayGroup[] = [];
      let lastKnownPoints = 0;

      // 4. 连续遍历日期，填充空缺
      while (cursor <= endDate) {
          const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
          const items = groups[dateStr] || [];
          
          let dayGroup: DayGroup;

          if (items.length > 0) {
              const currentPoints = items[items.length - 1].points;
              let diff = 0;
              
              if (denseGroups.length === 0) {
                  diff = currentPoints - items[0].points;
              } else {
                  diff = currentPoints - lastKnownPoints;
              }

              dayGroup = {
                  date: dateStr,
                  timestamp: new Date(items[items.length-1].date).getTime(),
                  points: currentPoints,
                  diff,
                  items,
                  isGap: false
              };
              lastKnownPoints = currentPoints;
          } else {
              dayGroup = {
                  date: dateStr,
                  timestamp: cursor.getTime(),
                  points: lastKnownPoints,
                  diff: 0,
                  items: [],
                  isGap: true
              };
          }

          denseGroups.push(dayGroup);
          cursor.setDate(cursor.getDate() + 1);
          if (denseGroups.length > 2000) break;
      }
      
      // 5. 返回降序 (最新的在最前)
      return denseGroups.reverse();
  };

  const aggregatedHistory = getAggregatedHistory(account.pointHistory || []);

  // 渲染图表
  const renderChart = (dailyData: DayGroup[]) => {
    // 1. 数据筛选
    let chartData = [...dailyData];
    if (chartConfig.dateRange > 0) {
        chartData = chartData.slice(0, chartConfig.dateRange);
    }
    // 按时间升序排列用于绘图
    chartData = chartData.reverse();

    if (chartData.length < 2) return <div className="text-gray-500 text-center py-10 flex items-center justify-center h-full">数据不足，无法生成图表</div>;

    const { width, height } = chartDimensions;
    if (width < 50 || height < 50) return null;

    const paddingX = 30; 
    const paddingY = 40; // 底部留给日期标签的空间
    const paddingTop = 60; // 增加顶部空间，避免与配置按钮重叠

    const scores = chartData.map(d => d.points);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const rangeScore = maxScore - minScore || 1;

    const diffs = chartData.map(d => d.diff);
    const minDiff = Math.min(...diffs, 0);
    const maxDiff = Math.max(...diffs, 100);
    const rangeDiff = maxDiff - minDiff || 1;

    const getX = (i: number) => paddingX + (i / (chartData.length - 1)) * (width - paddingX * 2);
    const getY_Score = (val: number) => height - paddingY - ((val - minScore) / rangeScore) * (height - paddingY - paddingTop);
    const getY_Diff = (val: number) => height - paddingY - ((val - minDiff) / rangeDiff) * (height - paddingY - paddingTop) * 0.3; 

    const createPath = (getValue: (d: DayGroup) => number, getY: (v: number) => number) => {
        let path = `M ${getX(0)} ${getY(getValue(chartData[0]))}`;
        for (let i = 0; i < chartData.length - 1; i++) {
            const x0 = getX(i);
            const y0 = getY(getValue(chartData[i]));
            const x1 = getX(i + 1);
            const y1 = getY(getValue(chartData[i + 1]));
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
    const fillPath = `${dScore} L ${getX(chartData.length - 1)} ${height - paddingY} L ${getX(0)} ${height - paddingY} Z`;

    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <defs>
            <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0"/>
            </linearGradient>
        </defs>
        
        {/* Background Grid Lines */}
        <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} stroke="#374151" strokeWidth="1" />
        <line x1={paddingX} y1={paddingTop} x2={width - paddingX} y2={paddingTop} stroke="#374151" strokeWidth="1" strokeDasharray="4 4"/>
        
        {/* Vertical Grid Lines (Daily) */}
        {chartConfig.showGridLines && chartData.map((_, i) => {
            const x = getX(i);
            return <line key={`grid-${i}`} x1={x} y1={paddingTop} x2={x} y2={height - paddingY} stroke="#374151" strokeWidth="1" strokeDasharray="2 2" opacity="0.3" />;
        })}

        {/* Data Paths */}
        <path d={fillPath} fill="url(#scoreGradient)" />
        <path d={dScore} fill="none" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d={dDiff} fill="none" stroke="#FBBF24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4" opacity="0.6" />
        
        {/* X-Axis Date Labels (Adaptive) */}
        {chartData.map((d, i) => {
            const total = chartData.length;
            let step = 1;
            if (total > 15) step = 2;
            if (total > 30) step = 5;
            
            if (i % step !== 0 && i !== total - 1) return null;

            const x = getX(i);
            const [y, m, day] = d.date.split('-').map(Number);
            const dateStr = `${m}/${day}`;
            
            return (
                <text key={`label-${i}`} x={x} y={height - 10} fill="#9CA3AF" fontSize="10" textAnchor="middle" className="select-none font-mono">
                    {dateStr}
                </text>
            );
        })}

        {/* Legend */}
        <g transform={`translate(${paddingX}, 20)`}>
            <rect width="8" height="8" rx="2" fill="#60A5FA" />
            <text x="12" y="8" fill="#9CA3AF" fontSize="10" fontWeight="bold">总分</text>
            <rect x="50" width="8" height="8" rx="2" fill="#FBBF24" />
            <text x="62" y="8" fill="#9CA3AF" fontSize="10" fontWeight="bold">增量</text>
        </g>

        {/* Data Points & Tooltips & Labels */}
        {chartData.map((d, i) => {
          const x = getX(i);
          const yS = getY_Score(d.points);
          const yD = getY_Diff(d.diff);
          
          return (
             <g key={i} className="group">
                {/* Invisible Hover Zone */}
                <rect x={x - (width / chartData.length / 2)} y={paddingTop} width={width / chartData.length} height={height - paddingY} fill="transparent" />
                
                {/* Point Dots */}
                {chartConfig.showPoints && (
                    <circle 
                        cx={x} cy={yS} r="3" 
                        fill={d.isGap ? '#111827' : '#1E40AF'} 
                        stroke={d.isGap ? '#6B7280' : '#60A5FA'} 
                        strokeWidth="2" 
                    />
                )}
                
                {/* Data Labels */}
                {chartConfig.showLabels && (() => {
                    const gap = Math.abs(yS - yD);
                    const threshold = 20; 
                    
                    let labelPosS = yS - 8;
                    let labelPosD = yD - 8;

                    if (gap < threshold) {
                        labelPosD = yD + 15; 
                    }

                    return (
                        <>
                            <text x={x} y={labelPosS} fill={d.isGap ? '#9CA3AF' : '#60A5FA'} fontSize="9" textAnchor="middle" fontWeight="bold" className="pointer-events-none drop-shadow-md">{d.points}</text>
                            <text x={x} y={labelPosD} fill={d.isGap ? '#6B7280' : '#FBBF24'} fontSize="9" textAnchor="middle" fontWeight="bold" className="pointer-events-none drop-shadow-md">{d.diff > 0 ? `+${d.diff}` : d.diff}</text>
                        </>
                    );
                })()}

                {/* Hover Line */}
                <line x1={x} y1={paddingTop} x2={x} y2={height - paddingY} stroke="white" strokeWidth="1" opacity="0" className="group-hover:opacity-20 transition-opacity" />

                {/* Tooltip (ForeignObject) */}
                <foreignObject x={x < width / 2 ? x : x - 120} y={paddingTop + 10} width="120" height="80" className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 overflow-visible">
                   <div className={`bg-gray-900/95 backdrop-blur border ${d.isGap ? 'border-gray-700' : 'border-blue-500/50'} rounded-lg p-2 shadow-xl text-xs ${x < width/2 ? 'ml-2' : 'mr-2'}`}>
                       <div className="text-gray-400 font-mono border-b border-gray-700 pb-1 mb-1 text-center">{d.date} {d.isGap && '(无记录)'}</div>
                       <div className="flex justify-between text-blue-300 font-bold"><span>Total:</span><span>{d.points}</span></div>
                       <div className="flex justify-between text-yellow-300 font-bold"><span>Diff:</span><span>{d.diff > 0 ? `+${d.diff}` : d.diff}</span></div>
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
             <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 custom-scrollbar font-mono text-sm flex flex-col">
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
             <div className="bg-gray-900 border-t border-gray-800 p-2 flex items-center justify-end gap-2 shrink-0 select-none">
                 <span className="text-[10px] text-gray-500 font-bold uppercase mr-1">打印速度:</span>
                 <div className="flex bg-black/30 rounded-lg p-0.5 border border-gray-700">
                     {['slow','normal','fast','turbo','instant'].map(opt => (
                         <button key={opt} onClick={() => setSpeed(opt as SpeedPreset)} className={`px-3 py-1 text-[10px] rounded-md transition-all font-medium ${speed === opt ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>{opt}</button>
                     ))}
                 </div>
             </div>
             </>
           )}

           {activeTab === 'history' && (
             <div className="h-full flex flex-col overflow-hidden">
                <div className="shrink-0 h-[40vh] min-h-[250px] max-h-[400px] bg-gray-800/30 border-b border-gray-700 p-4 relative flex flex-col">
                   <div className="absolute top-3 right-3 z-50 flex flex-col items-end gap-2">
                       <button onClick={() => setShowChartSettings(!showChartSettings)} className={`p-1.5 rounded transition-all flex items-center gap-1 text-xs border ${showChartSettings ? 'bg-gray-700 text-white border-gray-600' : 'text-gray-500 hover:text-white border-transparent hover:bg-gray-700/50'}`}>
                           <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.533 1.533 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"></path></svg>
                           配置
                       </button>
                       {showChartSettings && (
                           <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3 flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100 min-w-[160px]">
                               <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Display Options</div>
                               <div className="flex items-center justify-between">
                                   <span className="text-xs text-gray-300">显示数据点</span>
                                   <ToggleSwitch checked={chartConfig.showPoints} onChange={v => updateChartConfig({showPoints: v})} />
                               </div>
                               <div className="flex items-center justify-between">
                                   <span className="text-xs text-gray-300">显示纵向网格</span>
                                   <ToggleSwitch checked={chartConfig.showGridLines} onChange={v => updateChartConfig({showGridLines: v})} />
                               </div>
                               <div className="flex items-center justify-between">
                                   <span className="text-xs text-gray-300">显示数据标签</span>
                                   <ToggleSwitch checked={chartConfig.showLabels} onChange={v => updateChartConfig({showLabels: v})} />
                               </div>
                               
                               <div className="h-[1px] bg-gray-700 my-1"></div>
                               <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Date Range</div>
                               <div className="grid grid-cols-4 gap-1">
                                   {([7, 15, 30, 0] as DateRange[]).map(d => (
                                       <button 
                                           key={d}
                                           onClick={() => updateChartConfig({dateRange: d})}
                                           className={`text-[10px] py-1 rounded border ${chartConfig.dateRange === d ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-white'}`}
                                       >
                                           {d === 0 ? 'All' : `${d}d`}
                                       </button>
                                   ))}
                               </div>
                           </div>
                       )}
                   </div>
                   
                   <div ref={setChartContainerRef} className="w-full h-full">
                        {renderChart(aggregatedHistory)}
                   </div>
                </div>
                
                <div className="flex-1 flex flex-col p-6 min-h-0 bg-gray-900/20">
                  <h4 className="text-gray-400 text-sm mb-3 font-bold flex items-center gap-2 shrink-0">
                      <span className="w-1.5 h-4 bg-purple-500 rounded-full"></span>
                      每日结算记录 (Daily Aggregated)
                  </h4>
                  <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 select-none shadow-lg relative isolate overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left text-sm text-gray-400 border-separate border-spacing-0">
                        <thead className="text-gray-200 sticky top-0 z-30 bg-gray-800 shadow-sm">
                            <tr>
                            <th className="p-3 pl-4 border-b border-gray-700 bg-gray-800 h-[45px]">日期</th>
                            <th className="p-3 border-b border-gray-700 bg-gray-800 h-[45px]">当日结余</th>
                            <th className="p-3 border-b border-gray-700 bg-gray-800 h-[45px]">日变化</th>
                            </tr>
                        </thead>
                        <tbody>
                            {aggregatedHistory.length === 0 ? (
                                <tr><td colSpan={3} className="p-4 text-center text-gray-600">暂无历史数据</td></tr>
                            ) : (
                                aggregatedHistory.map((h) => {
                                    const isExpanded = expandedDate === h.date;
                                    return (
                                    <React.Fragment key={h.date}>
                                        <tr 
                                            onClick={() => setExpandedDate(isExpanded ? null : h.date)}
                                            className={`transition-all cursor-pointer group relative ${isExpanded ? 'sticky top-[44px] z-20 shadow-md bg-gray-750' : 'hover:bg-gray-700/50 bg-gray-800'} ${h.isGap ? 'opacity-60' : ''}`}
                                        >
                                            <td className={`p-3 pl-4 font-mono flex items-center gap-2 border-b border-gray-700 ${isExpanded ? 'border-gray-600' : ''}`}>
                                                <span className={`transform transition-transform text-gray-500 text-xs ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                {h.date}
                                                {h.isGap && <span className="text-[10px] bg-gray-700 px-1 rounded text-gray-400 ml-1">无记录</span>}
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
                                                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-2">详细记录 (Raw Log)</div>
                                                        {h.items.length === 0 ? (
                                                            <div className="text-xs text-gray-600 italic pb-2">此日无记录，积分延续自前一日</div>
                                                        ) : (
                                                            h.items.map((detail, idx) => (
                                                                <div key={idx} className="flex justify-between text-xs font-mono text-gray-400 border-b border-gray-700/30 last:border-0 pb-1 mb-1">
                                                                    <span>{new Date(detail.date).toLocaleTimeString()}</span>
                                                                    <span className="text-blue-300">{detail.points.toLocaleString()}</span>
                                                                </div>
                                                            ))
                                                        )}
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
