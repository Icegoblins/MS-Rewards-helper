
import React, { useEffect, useRef } from 'react';

interface PasteTrapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaste: (text: string) => void;
  error?: string; // 新增：接收错误信息
}

const PasteTrapModal: React.FC<PasteTrapModalProps> = ({ isOpen, onClose, onPaste, error }) => {
  const hiddenInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      // 自动聚焦隐藏输入框以捕获粘贴
      const timer = setTimeout(() => hiddenInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // 监听全局粘贴事件作为双重保障
  useEffect(() => {
      if (!isOpen) return;

      const handleGlobalPaste = (e: ClipboardEvent) => {
          const text = e.clipboardData?.getData('text');
          if (text) {
              e.preventDefault();
              onPaste(text);
          }
      };

      document.addEventListener('paste', handleGlobalPaste);
      return () => document.removeEventListener('paste', handleGlobalPaste);
  }, [isOpen, onPaste]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300" onClick={onClose}>
      <div className={`bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm border flex flex-col overflow-hidden transition-colors duration-300 ${error ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'border-gray-700'}`} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${error ? 'bg-red-900/30 border-red-800' : 'bg-gray-900/50 border-gray-700'}`}>
          <h3 className={`text-lg font-bold flex items-center gap-2 ${error ? 'text-red-400' : 'text-white'}`}>
            {error ? '⚠️ 格式错误' : '📋 粘贴提示'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">✕</button>
        </div>

        <div className="p-6 text-center relative flex flex-col items-center">
            
            {/* 动态图标/内容区域 */}
            {error ? (
                <div className="animate-in fade-in zoom-in duration-200 w-full">
                    <div className="mx-auto w-14 h-14 bg-red-900/30 rounded-full flex items-center justify-center mb-3 border border-red-500/50">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 mb-4">
                        <p className="text-sm font-bold text-red-300 break-words">{error}</p>
                    </div>
                    <p className="text-xs text-gray-400 mb-2">请重新复制正确的 Token 后再粘贴</p>
                </div>
            ) : (
                <>
                    <div className="mx-auto w-14 h-14 bg-blue-900/30 rounded-full flex items-center justify-center mb-4 border border-blue-500/30 shadow-[0_0_15px_-3px_rgba(59,130,246,0.3)]">
                        <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    </div>

                    <p className="text-sm text-gray-300 mb-6 leading-relaxed">
                        受浏览器安全策略限制<br/>
                        <span className="text-gray-500 text-xs">(非 HTTPS/Localhost 环境)</span><br/>
                        请直接按下键盘快捷键：
                    </p>

                    <div className="bg-black/30 rounded-xl p-4 border border-gray-700/50 flex items-center justify-center gap-3 mb-2 shadow-inner w-full">
                        <kbd className="px-3 py-1.5 bg-gray-700 border-b-2 border-gray-600 rounded-lg text-gray-200 font-mono font-bold text-sm shadow-sm">Ctrl</kbd>
                        <span className="text-gray-500 font-bold">+</span>
                        <kbd className="px-3 py-1.5 bg-gray-700 border-b-2 border-gray-600 rounded-lg text-gray-200 font-mono font-bold text-sm shadow-sm">V</kbd>
                    </div>
                    
                    <p className="text-[10px] text-gray-600 mt-2">Mac 用户请按 Cmd + V</p>
                </>
            )}

            {/* Hidden trap for focus */}
            <textarea 
                ref={hiddenInputRef}
                className="absolute opacity-0 top-0 left-0 w-1 h-1" 
                readOnly
                autoFocus
            />
        </div>
      </div>
    </div>
  );
};

export default PasteTrapModal;
