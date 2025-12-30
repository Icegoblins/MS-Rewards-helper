

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Account, LogEntry, AppConfig } from '../types';
import ToggleSwitch from './ToggleSwitch';
import { getNextRunDate, formatShortDate, parseTokenInput } from '../utils/helpers';
import * as Service from '../services/msRewardsService';
import PasteTrapModal from './PasteTrapModal';
import CountdownTimer from './CountdownTimer';

interface AccountCardProps {
  account: Account;
  onRemove: (id: string) => void;
  onOpenMonitor: (id: string) => void;
  onRefresh: (id: string) => void; 
  onRunSingle: (id: string) => void; 
  onEditAccount: (id: string, updates: Partial<Account>) => void;
  onEditModeChange?: (isEditing: boolean) => void;
  onOpenCronGenerator: (initialValue: string, callback: (val: string) => void) => void; 
  autoCloseDelay?: number; 
  proxyUrl: string; 
  onLog: (msg: string, type: LogEntry['type'], source?: string) => void; 
  cardFontSizes?: AppConfig['cardFontSizes']; 
  disableAutoClose?: boolean; 
  preciseCountdown?: boolean; 
}

// -------------------------------------------------------------------------
// 性能优化：将子组件移至外部定义
// 避免 AccountCard 每次渲染时重新创建组件函数，导致子组件强制卸载/重绘
// -------------------------------------------------------------------------

interface EnergyBarProps { 
    current: number; 
    max: number; 
    label: string; 
    type?: 'default' | 'pc' | 'mobile' | 'checkin' | 'daily' | 'activities'; 
    customText?: string;
    forceFull?: boolean;
    alwaysShow?: boolean;
}

const EnergyBar = React.memo(({ current, max, label, type = 'default', customText, forceFull = false, alwaysShow = false }: EnergyBarProps) => {
    if (max <= 0 && !forceFull && !alwaysShow) return null;
    
    const safeMax = max > 0 ? max : 1;
    const safeCurrent = forceFull ? safeMax : current;
    const percent = Math.min(100, Math.round((safeCurrent / safeMax) * 100));
    const isComplete = (safeCurrent >= safeMax && max > 0) || forceFull;
    
    let barColor = '';
    let textColor = '';
    let barBg = 'bg-gray-900/60'; 

    switch (type) {
        case 'pc':
             barColor = 'bg-[#0067B8]'; // Microsoft Blue
             textColor = 'text-blue-400'; 
             break;
        case 'mobile':
             barColor = 'bg-[#037FB0]'; // Cyan-ish Blue
             textColor = 'text-cyan-400'; 
             break;
        case 'checkin':
             barColor = 'bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600';
             textColor = 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-purple-300 font-bold';
             barBg = 'bg-blue-900/20'; 
             break;
        case 'daily':
             barColor = 'bg-gradient-to-r from-amber-500 to-orange-600';
             textColor = 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-300 font-bold';
             barBg = 'bg-orange-900/20';
             break;
        case 'activities':
             barColor = 'bg-gradient-to-r from-pink-500 to-rose-500';
             textColor = 'text-pink-300 font-bold';
             barBg = 'bg-pink-900/20';
             break;
        case 'default':
        default:
             barColor = isComplete ? 'bg-emerald-500' : 'bg-blue-500';
             textColor = isComplete ? 'text-emerald-400' : 'text-blue-400';
             break;
    }
    
    let statusText = `${current}/${max}`;
    
    if (max <= 0 && !customText) {
        statusText = '--/--'; 
    } else if (customText) {
        statusText = customText;
    } else if ((type === 'checkin' || type === 'daily') && max > 100) {
        statusText = current > 0 ? `🔥 已签 ${current} 天` : '未签到';
    } else if ((type === 'checkin' || type === 'daily') && max === 1) {
        statusText = current > 0 ? '已完成' : '未签到';
    }

    const displayPercent = (max <= 0 && !forceFull) ? 0 : percent;

    return (
      <div className="flex flex-col gap-1 w-full mt-1">
          <div className="flex justify-between items-end text-[10px] text-gray-500 font-mono font-medium uppercase truncate">
              <span className="truncate pr-2" title={label}>{label}</span>
              <span className={`shrink-0 ${textColor}`}>
                  {statusText}
              </span>
          </div>
          <div className={`h-1.5 w-full rounded-full overflow-hidden ${barBg}`}>
               <div 
                  className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`} 
                  style={{ width: `${displayPercent}%` }}
               ></div>
          </div>
      </div>
    );
});

// -------------------------------------------------------------------------
// Main Component
// -------------------------------------------------------------------------

const AccountCard: React.FC<AccountCardProps> = ({ account, onRemove, onOpenMonitor, onRefresh, onRunSingle, onEditAccount, onEditModeChange, onOpenCronGenerator, autoCloseDelay = 30, proxyUrl, onLog, cardFontSizes, disableAutoClose = false, preciseCountdown = false }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState(account.name);
  const [editToken, setEditToken] = useState(account.refreshToken);
  const [editCron, setEditCron] = useState(account.cronExpression || '');
  const [editEnabled, setEditEnabled] = useState(account.enabled !== false);
  const [editIgnoreRisk, setEditIgnoreRisk] = useState(account.ignoreRisk || false); 
  const [deleteStep, setDeleteStep] = useState(0); 
  
  const [latestLog, setLatestLog] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  
  const [tokenUpdateStep, setTokenUpdateStep] = useState<0 | 1>(0);
  const [authFeedback, setAuthFeedback] = useState('');
  const [tokenFeedback, setTokenFeedback] = useState('');
  const [tokenError, setTokenError] = useState(''); 
  const pendingTokenRef = useRef<{ type: 'code' | 'token', value: string } | null>(null);
  
  // Paste Trap State
  const [showPasteTrap, setShowPasteTrap] = useState(false);
  const [pasteTrapError, setPasteTrapError] = useState(''); 

  const autoCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fontTotal = cardFontSizes?.totalPoints || 'text-3xl';
  const fontChange = cardFontSizes?.dailyChange || 'text-2xl';

  const handleLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
      onLog(msg, type, `Account:${account.name}`);
  }, [onLog, account.name]);

  const resetAutoCloseTimer = () => {
      if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
      if (disableAutoClose || showPasteTrap) return; 

      if (autoCloseDelay > 0 && isEditMode) {
          autoCloseTimer.current = setTimeout(() => {
              setIsEditMode(false);
              setIsHovered(false);
          }, autoCloseDelay * 1000);
      }
  };

  useEffect(() => {
      if (disableAutoClose) {
          if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
      } else if (isEditMode) {
          resetAutoCloseTimer();
      }
  }, [disableAutoClose, isEditMode]);

  useEffect(() => {
      if (isEditMode) {
          resetAutoCloseTimer();
      } else {
          if (autoCloseTimer.current) clearTimeout(autoCloseTimer.current);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, autoCloseDelay, showPasteTrap]);

  useEffect(() => {
      onEditModeChange?.(isEditMode);
  }, [isEditMode, onEditModeChange]);

  useEffect(() => {
      if (account.logs && account.logs.length > 0) {
          const last = account.logs[account.logs.length - 1];
          setLatestLog(last.message);
      }
  }, [account.logs]);

  useEffect(() => {
      if (!isEditMode) {
          setEditName(account.name);
          setEditToken(account.refreshToken);
          setEditCron(account.cronExpression || '');
          setEditEnabled(account.enabled !== false);
          setEditIgnoreRisk(account.ignoreRisk || false);
          setDeleteStep(0);
          setTokenUpdateStep(0);
          setTokenError('');
          pendingTokenRef.current = null;
          setShowPasteTrap(false);
          setPasteTrapError('');
      }
  }, [account, isEditMode]);

  const nextRunObj = useMemo(() => {
      if (!account.cronExpression || account.enabled === false || account.cronEnabled === false) {
          return null;
      }
      return getNextRunDate(account.cronExpression);
  }, [account.cronExpression, account.enabled, account.cronEnabled]);

  const handleSaveEdit = () => {
      onEditAccount(account.id, { 
          name: editName, 
          refreshToken: editToken, 
          cronExpression: editCron,
          enabled: editEnabled,
          ignoreRisk: editIgnoreRisk
      });
      setIsEditMode(false);
  };

  const handleCopyAuthLink = async () => {
      const scope = encodeURIComponent("service::prod.rewardsplatform.microsoft.com::MBI_SSL offline_access openid profile");
      const link = `https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&scope=${scope}&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&prompt=login`;
      
      try {
          await navigator.clipboard.writeText(link);
          setAuthFeedback('链接已复制');
          setTimeout(() => setAuthFeedback(''), 1500);
      } catch (err) {
          alert('无法写入剪贴板，请检查浏览器权限');
      }
  };

  const handleTextRead = async (text: string) => {
      const result = parseTokenInput(text);
      if (!result) {
          const errMsg = '格式错误: 需以 M. 开头或为 Auth URL';
          
          if (showPasteTrap) {
              setPasteTrapError(errMsg);
              setTimeout(() => setPasteTrapError(''), 3000);
          } else {
              setTokenError(`❌ ${errMsg}`);
              setTimeout(() => setTokenError(''), 4000);
          }
          return;
      }
      
      setTokenError(''); 
      setPasteTrapError('');
      pendingTokenRef.current = result;
      setTokenUpdateStep(1);
      setShowPasteTrap(false); 
  };

  const handleTokenUpdateClick = async () => {
      if (tokenUpdateStep === 0) {
          setTokenError('');
          if (navigator.clipboard && navigator.clipboard.readText) {
              try {
                  const text = await navigator.clipboard.readText();
                  await handleTextRead(text);
                  return;
              } catch (e) {
                  console.warn("Clipboard API failed, falling back to trap", e);
              }
          }
          setShowPasteTrap(true);
          setPasteTrapError('');

      } else {
          if (!pendingTokenRef.current) return setTokenUpdateStep(0);
          try {
              let finalRefreshToken = pendingTokenRef.current.value;
              if (pendingTokenRef.current.type === 'code') {
                  const tokens = await Service.exchangeCodeForToken(pendingTokenRef.current.value, proxyUrl);
                  finalRefreshToken = tokens.refreshToken;
              }
              setEditToken(finalRefreshToken);
              onEditAccount(account.id, { refreshToken: finalRefreshToken });
              handleLog(`Token 手动更新成功`, 'success');
              setTokenFeedback('凭证已更新');
              setTimeout(() => setTokenFeedback(''), 2000);
          } catch (e: any) {
              setTokenError(`❌ 更新失败: ${e.message}`);
              handleLog(`Token 更新失败: ${e.message}`, 'error');
          } finally {
              setTokenUpdateStep(0);
              pendingTokenRef.current = null;
          }
      }
  };

  const getStatusStyle = (status: Account['status'], isEnabled: boolean) => {
    if (!isEnabled) return 'border-gray-700 bg-gray-900/50 opacity-60 grayscale'; 
    switch (status) {
      case 'running': return 'border-blue-500 bg-gray-800/95 shadow-[0_0_20px_-5px_rgba(59,130,246,0.6)] relative after:absolute after:inset-0 after:bg-gradient-to-tr after:from-blue-500/10 after:to-cyan-500/10 after:animate-pulse after:-z-10 after:rounded-2xl ring-1 ring-blue-400/30';
      case 'refreshing': return 'border-cyan-500/50 bg-gray-800/80 shadow-[0_0_15px_rgba(6,182,212,0.15)] animate-pulse ring-1 ring-cyan-400/20';
      case 'success': return 'border-emerald-500 bg-gray-800 shadow-none'; 
      case 'error': return 'border-rose-500 bg-gray-800 shadow-none';
      case 'risk': return 'border-red-600 bg-red-900/20 shadow-none';
      case 'waiting': return 'border-yellow-500/50 bg-gray-800 shadow-none';
      default: return 'border-gray-700 bg-gray-800/50 hover:bg-gray-800/80 shadow-none';
    }
  };

  const getStatusIcon = () => {
      if (account.enabled === false) return <div className="w-2 h-2 rounded-full bg-gray-600" />;
      if (account.status === 'running') return <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping opacity-90 shadow-[0_0_8px_#3b82f6]" />;
      if (account.status === 'refreshing') return <div className="w-2 h-2 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />;
      if (account.status === 'success') return <div className="w-2 h-2 rounded-full bg-emerald-400" />;
      if (account.status === 'error') return <div className="w-2 h-2 rounded-full bg-rose-500" />;
      if (account.status === 'risk') return <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />;
      return <div className="w-2 h-2 rounded-full bg-gray-500" />;
  };

  const getStatusText = () => {
      if (!account.enabled) return '已停用';
      switch (account.status) {
          case 'running': return '执行中...';
          case 'refreshing': return '刷新中...';
          case 'success': return '已完成';
          case 'risk': return '风控中';
          case 'waiting': return '等待中';
          default: return '闲置';
      }
  };

  const getTokenStatus = () => {
      if (!account.refreshToken) return { text: '凭证缺失', color: 'text-gray-400', bg: 'bg-gray-700/30', border: 'border-gray-600/30' };
      if (account.status === 'risk') {
          return { text: '账号风险', color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-700/50' };
      }
      return { text: '长期凭证激活 (自动续期)', color: 'text-emerald-300', bg: 'bg-emerald-900/20', border: 'border-emerald-700/30' };
  };

  const tokenStatus = getTokenStatus();
  const isAccountEnabled = account.enabled !== false;
  const isCronEnabled = account.cronEnabled !== false;

  // 只要有积分数据(说明成功获取过Dashboard) 或者 刚运行过，就视为有数据可展示
  const isRunToday = account.lastRunTime && new Date(account.lastRunTime).toDateString() === new Date().toDateString();
  const hasData = account.totalPoints > 0 || isRunToday;

  const sapphireDays = account.stats.checkInProgress || 0;
  let sapphireText = "待更新";
  if (hasData) {
      sapphireText = sapphireDays > 0 ? `🔥 已签 ${sapphireDays} 天` : "未签到";
  }

  // Type 103 状态逻辑
  const isType103Done = !!(account.lastDailySuccess && new Date(account.lastDailySuccess).toDateString() === new Date().toDateString());
  const type103Text = isType103Done ? "Activation" : "未激活";

  const isSuccessToday = isRunToday && account.status === 'success';
  const sapphireForceFull = isSuccessToday || sapphireDays > 0;

  return (
    <>
    <div 
        className={`relative rounded-2xl p-6 border transition-all duration-300 backdrop-blur-sm group h-full min-h-[350px] flex flex-col ${getStatusStyle(account.status, isAccountEnabled)}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
    >
      {/* Edit Overlay */}
      {isEditMode && (
        <div 
            className="absolute inset-0 bg-gray-900/95 backdrop-blur-md z-30 flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200 rounded-2xl"
            onMouseMove={resetAutoCloseTimer} 
            onKeyDown={resetAutoCloseTimer}
        >
            <div className="flex justify-between items-center border-b border-gray-700 pb-3 shrink-0">
                <h3 className="font-bold text-blue-400 font-mono text-base tracking-wider">:: 配置模式 ::</h3>
                <button onClick={() => setIsEditMode(false)} className="text-gray-400 hover:text-white p-1">✕</button>
            </div>
            
            <div className="space-y-5 flex-1 overflow-y-auto custom-scrollbar pr-1 py-4">
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase">备注名称</label>
                        <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-black/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none" />
                    </div>
                    <div className="flex flex-col items-end gap-2 pt-2">
                        <ToggleSwitch checked={editEnabled} onChange={setEditEnabled} label={editEnabled ? '启用' : '停用'} />
                    </div>
                </div>
                
                <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-2 flex items-center justify-between">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-red-400 uppercase flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            强制执行 (忽略风控)
                        </span>
                        <span className="text-[9px] text-red-300/60">即使微软标记 Risk 也继续尝试</span>
                    </div>
                    <ToggleSwitch 
                        checked={editIgnoreRisk} 
                        onChange={setEditIgnoreRisk} 
                    />
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1 uppercase flex justify-between">
                        <span>独立定时 (Cron)</span>
                        <span className="text-[10px] text-gray-600 font-normal">留空则跟随全局</span>
                    </label>
                    <div className="flex gap-2">
                        <input type="text" value={editCron} onChange={e => setEditCron(e.target.value)} placeholder="0 10 * * *" className="flex-1 bg-black/50 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-blue-500 focus:outline-none font-mono" />
                        <button onClick={() => onOpenCronGenerator(editCron, setEditCron)} className="px-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-white border border-gray-600 whitespace-nowrap">生成</button>
                        {editCron && <button onClick={() => setEditCron('')} className="px-3 bg-red-900/20 hover:bg-red-900/40 border border-red-800/50 text-red-400 rounded-lg text-xs transition-colors whitespace-nowrap">✕</button>}
                    </div>
                </div>

                <div>
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-[10px] font-bold text-gray-500 uppercase">Refresh Token 维护</label>
                    </div>
                    <div className={`bg-black/30 border rounded-lg p-2.5 transition-all duration-300 ${tokenError ? 'border-red-500 bg-red-900/20 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-gray-700'}`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs text-gray-400 ml-1 truncate pr-2 flex-1">
                                {editToken ? '✅ 系统已存有凭证' : '⚠️ 当前未配置凭证'}
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={handleCopyAuthLink} className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 text-[10px] rounded transition-all font-bold relative">
                                    获取授权
                                    {authFeedback && <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in whitespace-nowrap z-50">{authFeedback}</div>}
                                </button>
                                <button onClick={handleTokenUpdateClick} className={`px-2 py-1.5 border rounded text-[10px] transition-all font-bold relative ${tokenUpdateStep === 1 ? 'bg-red-600 hover:bg-red-500 border-red-500 text-white animate-pulse' : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white'}`}>
                                    {tokenUpdateStep === 1 ? '确认更新' : '更新 Token'}
                                    {tokenFeedback && <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-700 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in whitespace-nowrap z-50">{tokenFeedback}</div>}
                                </button>
                            </div>
                        </div>
                        {tokenError ? (
                            <div className="text-xs text-red-100 bg-red-600/80 rounded px-2 py-1.5 font-bold mt-2 text-center animate-in fade-in slide-in-from-top-1 shadow-sm">
                                {tokenError}
                            </div>
                        ) : (
                            <p className="text-[10px] text-gray-600 mt-2 text-center">
                                {tokenUpdateStep === 1 ? '⚠️ 确认将剪贴板内容写入系统？' : '先获取授权复制链接，登录后再点击右侧更新'}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex gap-3 pt-2 shrink-0">
                <button onClick={() => deleteStep === 0 ? setDeleteStep(1) : onRemove(account.id)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${deleteStep === 1 ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-gray-800 text-red-400 hover:bg-red-900/30'}`}>
                    {deleteStep === 1 ? '确认删除?' : '删除'}
                </button>
                <button onClick={handleSaveEdit} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-xs font-bold shadow-lg shadow-blue-900/20">保存修改</button>
            </div>
        </div>
      )}

      {/* Header Info */}
      <div className="relative flex justify-between items-start mb-8 z-10 shrink-0">
        <div className="flex flex-col w-full pr-32"> 
           <div className="flex items-center gap-2 mb-3">
               <h3 className={`text-xl font-bold truncate font-mono tracking-tight select-none ${isAccountEnabled ? 'text-gray-100' : 'text-gray-500 line-through'}`} title={account.name}>{account.name}</h3>
               {account.ignoreRisk && isAccountEnabled && (
                   <div className="bg-red-500/20 border border-red-500/50 rounded px-1.5 py-0.5" title="⚠️ 已启用：忽略风控">
                       <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                   </div>
               )}
           </div>
           
           <div className="flex flex-col items-start gap-2.5">
               <div className="flex shrink-0 items-center gap-1.5 bg-black/40 px-2.5 py-1 rounded-md border border-gray-700/50">
                   {getStatusIcon()}
                   <span className="text-sm text-gray-300 font-mono font-medium">
                       {getStatusText()}
                   </span>
                   {account.cronExpression && isAccountEnabled && isCronEnabled && (
                       <div className="relative group/timer ml-1 pl-2 border-l border-gray-600 flex items-center gap-1 cursor-help">
                           <span className="text-xs text-purple-400">⏰</span>
                           <CountdownTimer 
                               cron={account.cronExpression} 
                               enabled={true} 
                               precise={preciseCountdown}
                               className="font-mono text-xs text-purple-300 tabular-nums min-w-[4rem] text-center whitespace-nowrap"
                           />
                           <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max hidden group-hover/timer:block z-50">
                               <div className="bg-gray-900/95 backdrop-blur border border-gray-700 text-xs text-gray-300 p-2 rounded shadow-xl flex flex-col gap-1">
                                   <div className="font-bold text-purple-400 border-b border-gray-700 pb-1 mb-1">定时任务详情</div>
                                   <div>Cron: <span className="font-mono text-gray-400">{account.cronExpression}</span></div>
                                   <div>预计运行: <span className="font-mono text-white">{formatShortDate(nextRunObj)}</span></div>
                               </div>
                               <div className="w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2"></div>
                           </div>
                       </div>
                   )}
                   {account.cronExpression && !isCronEnabled && isAccountEnabled && (
                        <div className="ml-1 pl-2 border-l border-gray-600 flex items-center gap-1" title="计时器已暂停">
                            <span className="text-xs text-gray-600">⏸</span>
                        </div>
                   )}
               </div>
               
               <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${tokenStatus.bg} ${tokenStatus.border}`}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${tokenStatus.color === 'text-emerald-300' ? 'bg-emerald-400' : 'bg-current'} ${tokenStatus.color}`}></div>
                    <span className={`text-sm font-mono font-medium truncate ${tokenStatus.color}`}>
                       {tokenStatus.text}
                    </span>
               </div>
           </div>
        </div>

        {/* Settings Buttons */}
        <div className={`absolute top-2 right-2 z-20 flex gap-2 transition-opacity duration-200 ${isHovered || account.status === 'running' || account.status === 'refreshing' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <button onClick={(e) => { e.stopPropagation(); onRunSingle(account.id); }} className="p-2.5 rounded-lg text-gray-400 bg-gray-800/90 hover:text-green-400 hover:bg-gray-700 border border-gray-600 hover:border-green-500/50 shadow-lg backdrop-blur" title="立即执行">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRefresh(account.id); }} className="p-2.5 rounded-lg text-gray-400 bg-gray-800/90 hover:text-cyan-400 hover:bg-gray-700 border border-gray-600 hover:border-cyan-500/50 shadow-lg backdrop-blur" title="刷新状态">
               <svg className={`w-5 h-5 ${account.status === 'refreshing' ? 'animate-spin text-cyan-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); onOpenMonitor(account.id); }} className="p-2.5 rounded-lg text-gray-400 bg-gray-800/90 hover:text-blue-400 hover:bg-gray-700 border border-gray-600 hover:border-blue-500/50 shadow-lg backdrop-blur" title="查看监控">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"></path></svg>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setIsEditMode(true); }} className="p-2.5 rounded-lg text-gray-400 bg-gray-800/90 hover:text-yellow-400 hover:bg-gray-700 border border-gray-600 hover:border-yellow-500/50 shadow-lg backdrop-blur" title="设置">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
               </svg>
            </button>
        </div>
      </div>

      <div className={`grid grid-cols-[1.3fr_0.7fr] gap-4 mb-5 relative z-10 transition-opacity flex-1 ${!isAccountEnabled ? 'opacity-50' : ''}`}>
          <div className="bg-black/20 rounded-xl p-2.5 border border-gray-700/50 flex flex-col justify-between min-w-0">
              <p className="text-[10px] font-bold text-gray-500 uppercase w-full truncate">当前积分</p>
              <div className="flex items-end gap-1.5 w-full min-w-0">
                  <span className={`${fontTotal} font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-yellow-500 tracking-tight truncate leading-none`} title={account.totalPoints.toLocaleString()}>
                      {account.totalPoints.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-yellow-600 font-bold shrink-0 mb-0.5">分</span>
              </div>
          </div>
          
          <div className="bg-black/20 rounded-xl p-2.5 border border-gray-700/50 flex flex-col justify-between min-w-0">
              <p className="text-[10px] font-bold text-gray-500 w-full truncate">较昨日变化</p>
              <div className="flex items-end gap-1 h-full w-full overflow-hidden">
                  {(() => {
                      const history = account.pointHistory || [];
                      const todayStr = new Date().toDateString();
                      let basePoints = 0;
                      let hasHistory = false;

                      if (history.length > 0) {
                          const lastRecordNotToday = [...history].reverse().find(h => new Date(h.date).toDateString() !== todayStr);
                          if (lastRecordNotToday) {
                              basePoints = lastRecordNotToday.points;
                              hasHistory = true;
                          } else {
                              basePoints = history[0].points;
                              hasHistory = true;
                          }
                      }
                      const diff = hasHistory ? account.totalPoints - basePoints : 0;
                      return (
                          <span className={`${fontChange} font-mono font-medium truncate leading-none w-full ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-600'}`}>
                              {diff > 0 ? `+${diff}` : diff === 0 ? '--' : diff}
                          </span>
                      )
                  })()}
              </div>
          </div>
      </div>

      <div className={`space-y-3 relative z-10 transition-opacity shrink-0 mb-6 ${!isAccountEnabled ? 'opacity-50' : ''}`}>
          
          {account.stats.redeemGoal && (
             <div className="mb-4 bg-amber-900/10 border border-amber-800/30 rounded-xl p-3 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">🎯</span>
                        <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">当前目标</span>
                    </div>
                    <span className="text-xs text-amber-200 font-bold truncate max-w-[120px]" title={account.stats.redeemGoal.title}>{account.stats.redeemGoal.title}</span>
                </div>
                <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-amber-600 to-yellow-400 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.min(100, (account.totalPoints / account.stats.redeemGoal.price) * 100)}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-amber-400/80">
                    <span>当前: {account.totalPoints.toLocaleString()}</span>
                    <span>目标: {account.stats.redeemGoal.price.toLocaleString()}</span>
                </div>
             </div>
          )}

          <EnergyBar current={account.stats.readProgress} max={account.stats.readMax} label="阅读任务" type="default" />
          
          <div className="grid grid-cols-3 gap-2">
              <EnergyBar current={account.stats.pcSearchProgress} max={account.stats.pcSearchMax} label="电脑" type="pc" />
              <EnergyBar current={account.stats.mobileSearchProgress} max={account.stats.mobileSearchMax} label="移动" type="mobile" alwaysShow={true} />
              <EnergyBar current={account.stats.dailyActivitiesProgress || 0} max={account.stats.dailyActivitiesMax || 0} label="日常" type="activities" alwaysShow={true} />
          </div>
          
          <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-gray-800/50">
              <EnergyBar 
                  current={account.stats.checkInProgress || 0} 
                  max={Math.max(account.stats.checkInMax || 0, 1)} 
                  label="Sapphire 签到" 
                  type="checkin" 
                  customText={sapphireText} 
                  forceFull={sapphireForceFull} 
              />
              <EnergyBar 
                  current={isType103Done ? 1 : 0} 
                  max={1} 
                  label="Type 103" 
                  type="daily" 
                  customText={type103Text} 
                  forceFull={isType103Done} 
              />
          </div>
      </div>

      <div className="mt-auto pt-3 border-t border-gray-700/50 relative z-10 shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400 h-5">
              <span className="text-blue-500 font-bold text-sm">{'>'}</span>
              <span className="truncate w-full opacity-90" title={latestLog}>
                  {latestLog || "系统就绪，等待指令..."}
              </span>
          </div>
      </div>

    </div>
    <PasteTrapModal 
        isOpen={showPasteTrap} 
        onClose={() => {
            setShowPasteTrap(false);
            setPasteTrapError('');
        }} 
        onPaste={handleTextRead} 
        error={pasteTrapError} 
    />
    </>
  );
};

export default React.memo(AccountCard);