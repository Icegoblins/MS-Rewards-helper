
import React from 'react';

interface CookieGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CookieGuideModal: React.FC<CookieGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">Bing Cookie 获取指南</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
           
           <div className="bg-blue-900/20 border border-blue-800 p-3 rounded text-sm text-blue-300">
               <strong>🎉 最佳方案：</strong> 我们为您生成了一个专用的浏览器扩展，可以一键提取所有需要的 Cookie (包括 HttpOnly)。
           </div>

           {/* 方法三：浏览器扩展 */}
           <div className="space-y-4">
               <h4 className="text-lg font-bold text-white flex items-center gap-2">
                   <span className="bg-green-600 text-xs px-2 py-1 rounded text-white">推荐</span>
                   方法：使用配套浏览器扩展
               </h4>
               
               <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
                 <li>
                     <strong>找到插件文件：</strong> 
                     <span className="text-gray-400 block ml-5 mt-1">
                        在本项目文件夹中，找到 <code>public/extension</code> 文件夹。
                     </span>
                 </li>
                 <li>
                     <strong>打开扩展管理页：</strong>
                     <span className="text-gray-400 block ml-5 mt-1">
                        Chrome: 输入 <code>chrome://extensions</code><br/>
                        Edge: 输入 <code>edge://extensions</code>
                     </span>
                 </li>
                 <li>
                     <strong>开启开发者模式：</strong>
                     <span className="text-gray-400 block ml-5 mt-1">
                        打开右上角的开关。
                     </span>
                 </li>
                 <li>
                     <strong>加载扩展：</strong>
                     <span className="text-gray-400 block ml-5 mt-1">
                        点击 <strong>“加载已解压的扩展程序”</strong>，选择项目中的 <code>public/extension</code> 文件夹。
                     </span>
                 </li>
                 <li>
                     <strong>使用：</strong>
                     <span className="text-gray-400 block ml-5 mt-1">
                        打开 Bing.com &rarr; 点击浏览器右上角的插件图标 &rarr; 点击“一键复制” &rarr; 回来粘贴。
                     </span>
                 </li>
               </ol>
           </div>

           <div className="border-t border-gray-700 my-4"></div>

           {/* 方法：手动获取 */}
           <div className="space-y-4 opacity-75">
               <h4 className="text-lg font-bold text-gray-400">备选方法：通过 F12 开发者工具</h4>
               <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400">
                 <li>打开 Bing.com 并登录。</li>
                 <li>按 <kbd className="bg-gray-700 px-1 rounded">F12</kbd> &rarr; <strong>应用 (Application)</strong> &rarr; <strong>Cookie</strong>。</li>
                 <li>复制 <code>_U</code>, <code>MUID</code> 等关键字段并拼接。</li>
               </ol>
           </div>
        </div>

        <div className="p-4 border-t border-gray-700 text-right">
          <button onClick={onClose} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieGuideModal;
