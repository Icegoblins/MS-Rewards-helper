
import React, { useEffect, useRef } from 'react';
import { SystemLog } from '../types';
import { formatTime } from '../utils/helpers';

interface SystemLogsProps {
  logs: SystemLog[];
}

const SystemLogs: React.FC<SystemLogsProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogStyle = (type: SystemLog['type']) => {
    switch (type) {
      case 'success': return 'text-emerald-400';
      case 'error': return 'text-rose-400';
      case 'warning': return 'text-amber-400';
      case 'risk': return 'text-red-500 font-bold';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="bg-gray-950 border-t border-gray-800 h-64 flex flex-col font-mono text-sm shadow-2xl relative group">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 select-none">
        <div className="flex items-center gap-2">
           <div className="flex gap-1.5">
             <div className="w-2.5 h-2.5 rounded-full bg-red-500/50"></div>
             <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50"></div>
             <div className="w-2.5 h-2.5 rounded-full bg-green-500/50"></div>
           </div>
           <span className="text-gray-500 text-xs font-bold ml-2">SYSTEM CONSOLE</span>
        </div>
        <div className="text-[10px] text-gray-600">bash --verbose</div>
      </div>

      {/* Logs Area - Standard Terminal Flow */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-0.5 custom-scrollbar scroll-smooth bg-black/90 backdrop-blur"
      >
         {logs.length === 0 && (
             <div className="h-full flex flex-col items-center justify-center text-gray-700 opacity-50">
                 <span className="animate-pulse">_ Waiting for system events...</span>
             </div>
         )}
         
         {logs.map((log) => (
           <div key={log.id} className="break-all leading-relaxed hover:bg-white/5 px-2 rounded-sm transition-colors text-xs md:text-sm">
             <span className="text-gray-600 select-none mr-2">[{formatTime(log.timestamp)}]</span>
             <span className={`font-bold mr-2 ${
                 log.source === 'WebDAV' ? 'text-purple-400' :
                 log.source === 'Scheduler' ? 'text-cyan-400' : 
                 log.source === 'Backup' ? 'text-orange-400' : 'text-blue-400'
             }`}>
               {log.source}:
             </span>
             <span className={getLogStyle(log.type)}>
               {log.message}
             </span>
           </div>
         ))}
      </div>
    </div>
  );
};

export default SystemLogs;
