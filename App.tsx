
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Account, AppConfig, LogEntry, SystemLog, WebDAVConfig } from './types';
import { delay, getRandomUUID, checkCronMatch, getNextRunDate, formatTime, formatTimeWithMs, parseTokenInput, formatDuration } from './utils/helpers';
import * as Service from './services/msRewardsService';
import { sendNotification } from './services/wxPusher';
import AccountCard from './components/AccountCard';
import ProxyGuideModal from './components/ProxyGuideModal';
import MonitorModal from './components/MonitorModal';
import WebDAVModal from './components/WebDAVModal';
import DataManageModal from './components/DataManageModal';
import SystemLogs from './components/SystemLogs';
import CronGeneratorModal from './components/CronGeneratorModal';
import GlobalSettingsModal from './components/GlobalSettingsModal';
import WxPusherModal from './components/WxPusherModal';
import TaskSchedulerModal from './components/TaskSchedulerModal';
import TimerManagerModal from './components/TimerManagerModal';
import LayoutSettingsModal from './components/LayoutSettingsModal';
import PasteTrapModal from './components/PasteTrapModal';
import CustomSelect from './components/CustomSelect'; 
import CountdownTimer from './components/CountdownTimer';

// 默认配置
const DEFAULT_CONFIG: AppConfig = {
  proxyUrl: 'http://127.0.0.1:3001', 
  delayBetweenAccounts: 5,
  runSign: true,
  runRead: true,
  minDelay: 3, 
  maxDelay: 8, 
  cron: {
    enabled: false,
    cronExpression: '0 4 * * *', 
  },
  gridCols: 0, // 0 = Auto
  layoutGap: 6,
  containerPadding: 8,
  wxPusher: {
      enabled: false,
      appToken: '',
      targets: []
  },
  localBackup: {
      enabled: false,
      path: 'backups',
      cronExpression: '0 12 * * *',
      maxFiles: 30
  },
  autoIdleDelay: 5,
  monitorLogDays: 1,
  
  // UI Defaults
  clockPosition: 'right', 
  editModeAutoCloseDelay: 30,
  showButtonHighlight: false,
  forceGreenIndicators: false,
  preciseCountdown: false,
  cardFontSizes: {
      totalPoints: 'text-3xl',
      dailyChange: 'text-2xl'
  },
  allowSinglePush: true, // Default allow single
  skipDailyCompleted: false // Default false
};

const TOKEN_REFRESH_THRESHOLD = 15 * 60 * 1000;

// 功能色卡定义
const FEATURE_COLORS = {
    task: { base: 'purple', border: 'border-purple-500', bg: 'bg-purple-900/30', text: 'text-purple-300', dot: 'bg-purple-500' },
    cloud: { base: 'blue', border: 'border-blue-500', bg: 'bg-blue-900/30', text: 'text-blue-300', dot: 'bg-blue-500' },
    local: { base: 'orange', border: 'border-orange-500', bg: 'bg-orange-900/30', text: 'text-orange-300', dot: 'bg-orange-500' },
    push: { base: 'emerald', border: 'border-emerald-500', bg: 'bg-emerald-900/30', text: 'text-emerald-300', dot: 'bg-emerald-500' }
};

// 独立时钟组件 - 使用 requestAnimationFrame 优化性能
const HeaderClock = React.memo(() => {
    const [timeStr, setTimeStr] = useState('');
    const [msStr, setMsStr] = useState('000');
    const requestRef = useRef<number | null>(null);

    const animate = () => {
        const now = new Date();
        setTimeStr(now.toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'}));
        setMsStr(now.getMilliseconds().toString().padStart(3, '0'));
        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, []);

    // 只有在 hydration 完成后才渲染内容
    if (!timeStr) return null;

    return (
        <div className="hidden lg:flex items-center ml-4 px-4 py-2 bg-black rounded-lg border border-gray-800 shadow-[0_0_20px_-5px_rgba(6,182,212,0.2)] font-mono gap-3 select-none group hover:border-cyan-500/50 transition-colors">
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]"></span>
                <span className="text-xl font-bold text-gray-100 tracking-widest text-shadow-glow">
                    {timeStr}
                </span>
            </div>
            <div className="flex flex-col justify-center border-l border-gray-700 pl-3 h-8">
                <span className="text-[10px] text-gray-500 font-bold uppercase leading-none mb-0.5">MS</span>
                <span className="text-sm text-cyan-500 font-bold leading-none w-9 tabular-nums">
                    {msStr}
                </span>
            </div>
        </div>
    );
});

// 定义执行模式类型
type ExecutionMode = 'all' | 'sign_only' | 'read_only';

const App: React.FC = () => {
  const safeJsonParse = (key: string, fallback: any) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : fallback;
    } catch (e) {
      console.error(`解析 ${key} 失败`, e);
      return fallback;
    }
  };

  const sanitizeAccounts = (rawAccounts: any[]): Account[] => {
    if (!Array.isArray(rawAccounts)) return [];
    return rawAccounts.map(acc => ({
      id: acc.id || getRandomUUID(),
      name: acc.name || '未命名账号',
      refreshToken: acc.refreshToken || '',
      accessToken: acc.accessToken,
      tokenExpiresAt: acc.tokenExpiresAt,
      status: acc.status === 'risk' ? 'risk' : 'idle', 
      logs: Array.isArray(acc.logs) ? acc.logs.slice(-50) : [], 
      lastRunTime: acc.lastRunTime,
      lastDailySuccess: acc.lastDailySuccess,
      totalPoints: typeof acc.totalPoints === 'number' ? acc.totalPoints : 0,
      pointHistory: Array.isArray(acc.pointHistory) ? acc.pointHistory : [],
      stats: {
        readProgress: acc.stats?.readProgress || 0,
        readMax: acc.stats?.readMax || 30,
        pcSearchProgress: acc.stats?.pcSearchProgress || 0,
        pcSearchMax: acc.stats?.pcSearchMax || 0,
        mobileSearchProgress: acc.stats?.mobileSearchProgress || 0,
        mobileSearchMax: acc.stats?.mobileSearchMax || 0,
        checkInProgress: acc.stats?.checkInProgress || 0,
        checkInMax: acc.stats?.checkInMax || 7,
        dailyActivitiesProgress: acc.stats?.dailyActivitiesProgress || 0,
        dailyActivitiesMax: acc.stats?.dailyActivitiesMax || 0,
        dailySetProgress: acc.stats?.dailySetProgress || 0,
        dailySetMax: acc.stats?.dailySetMax || 0,
      },
      enabled: acc.enabled !== false,
      cronEnabled: acc.cronEnabled !== false, 
      cronExpression: acc.cronExpression,
      ignoreRisk: acc.ignoreRisk || false 
    }));
  };

  const [accounts, setAccounts] = useState<Account[]>(() => sanitizeAccounts(safeJsonParse('ms_rewards_accounts', [])));
  const [config, setConfig] = useState<AppConfig>(() => {
     const loaded = safeJsonParse('ms_rewards_config', {});
     const cron = loaded.cron || DEFAULT_CONFIG.cron;
     let wxPusher = loaded.wxPusher || DEFAULT_CONFIG.wxPusher;
     // @ts-ignore
     if (wxPusher.uids && (!wxPusher.targets || wxPusher.targets.length === 0)) {
         // @ts-ignore
         wxPusher.targets = [{ id: 'default', name: '默认目标', uids: wxPusher.uids, filterAccounts: wxPusher.filterAccounts || [], enabled: true }];
     }

     return { 
         ...DEFAULT_CONFIG, 
         ...loaded, 
         cron,
         nutstore: loaded.nutstore || undefined,
         infinicloud: loaded.infinicloud || undefined,
         wxPusher,
         localBackup: loaded.localBackup || DEFAULT_CONFIG.localBackup,
         autoIdleDelay: loaded.autoIdleDelay ?? DEFAULT_CONFIG.autoIdleDelay,
         monitorLogDays: loaded.monitorLogDays ?? DEFAULT_CONFIG.monitorLogDays,
         clockPosition: loaded.clockPosition ?? DEFAULT_CONFIG.clockPosition,
         editModeAutoCloseDelay: loaded.editModeAutoCloseDelay ?? DEFAULT_CONFIG.editModeAutoCloseDelay,
         showButtonHighlight: loaded.showButtonHighlight ?? DEFAULT_CONFIG.showButtonHighlight,
         forceGreenIndicators: loaded.forceGreenIndicators ?? DEFAULT_CONFIG.forceGreenIndicators,
         preciseCountdown: loaded.preciseCountdown ?? DEFAULT_CONFIG.preciseCountdown,
         cardFontSizes: loaded.cardFontSizes ?? DEFAULT_CONFIG.cardFontSizes,
         layoutGap: loaded.layoutGap ?? DEFAULT_CONFIG.layoutGap,
         containerPadding: loaded.containerPadding ?? DEFAULT_CONFIG.containerPadding,
         allowSinglePush: loaded.allowSinglePush ?? DEFAULT_CONFIG.allowSinglePush,
         skipDailyCompleted: loaded.skipDailyCompleted ?? DEFAULT_CONFIG.skipDailyCompleted
     };
  });
  
  const [visibleWidgets, setVisibleWidgets] = useState<{ [key: string]: boolean }>(() => safeJsonParse('ms_rewards_layout_widgets', {
      total_pool: true,
      cron_timer: true,
      local_backup: true,
      cloud_sync: true
  }));

  useEffect(() => {
      localStorage.setItem('ms_rewards_layout_widgets', JSON.stringify(visibleWidgets));
  }, [visibleWidgets]);

  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const addSystemLog = useCallback((message: string, type: SystemLog['type'] = 'info', source: string = 'System') => {
      setSystemLogs(prev => [...prev, { id: getRandomUUID(), timestamp: Date.now(), type, message, source }].slice(-100)); 
  }, []);

  const [isRunning, setIsRunning] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false); 
  const stopTaskRef = useRef(false); 
  
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('all');
  
  const [showCronSettings, setShowCronSettings] = useState(false); 
  const [showCronGenerator, setShowCronGenerator] = useState(false); 
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showWxPusher, setShowWxPusher] = useState(false);
  const [showTimerManager, setShowTimerManager] = useState(false); 
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  
  const [cronGenTarget, setCronGenTarget] = useState<{ value: string, callback: (val: string) => void } | null>(null);

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingAccountIds, setEditingAccountIds] = useState<string[]>([]);
  
  const [newAccountToken, setNewAccountToken] = useState('');
  const [newAccountAccessToken, setNewAccountAccessToken] = useState(''); 
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountExpiresIn, setNewAccountExpiresIn] = useState(0);
  
  const [addTokenStep, setAddTokenStep] = useState<0 | 1>(0);
  const [addAuthFeedback, setAddAuthFeedback] = useState('');
  const [addTokenFeedback, setAddTokenFeedback] = useState('');
  const [addTokenError, setAddTokenError] = useState(''); 
  const pendingAddTokenRef = useRef<{ type: 'code' | 'token', value: string } | null>(null);
  
  const [showAddPasteTrap, setShowAddPasteTrap] = useState(false);
  const [addPasteTrapError, setAddPasteTrapError] = useState(''); 

  const [showProxyGuide, setShowProxyGuide] = useState(false);
  const [showWebDAV, setShowWebDAV] = useState(false);
  const [showDataManage, setShowDataManage] = useState(false);
  const [monitorAccountId, setMonitorAccountId] = useState<string | null>(null);

  // 使用 Ref 保持对最新状态的引用，供定时器使用
  const accountsRef = useRef(accounts);
  const configRef = useRef(config);
  const isRunningRef = useRef(isRunning);
  const isRefreshingAllRef = useRef(isRefreshingAll);

  // 同步 Refs
  useEffect(() => { accountsRef.current = accounts; localStorage.setItem('ms_rewards_accounts', JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { configRef.current = config; localStorage.setItem('ms_rewards_config', JSON.stringify(config)); }, [config]);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
  useEffect(() => { isRefreshingAllRef.current = isRefreshingAll; }, [isRefreshingAll]);

  const getButtonStyle = (enabled: boolean | undefined, type: keyof typeof FEATURE_COLORS) => {
      const colors = FEATURE_COLORS[type];
      const indicatorColor = config.forceGreenIndicators ? 'bg-green-500' : colors.dot;
      let baseClass = 'px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 shadow-sm relative whitespace-nowrap';
      if (config.showButtonHighlight && enabled) {
          return `${baseClass} ${colors.bg} ${colors.border} ${colors.text}`;
      }
      return `${baseClass} bg-gray-800/80 border-gray-700 text-gray-300 hover:border-gray-500`;
  };

  const getIndicator = (enabled: boolean | undefined, type: keyof typeof FEATURE_COLORS) => {
      if (!enabled) return null;
      const colors = FEATURE_COLORS[type];
      const indicatorColor = config.forceGreenIndicators ? 'bg-green-500' : colors.dot;
      const shadowClass = !config.showButtonHighlight ? 'shadow-[0_0_8px_rgba(255,255,255,0.4)]' : '';
      return <span className={`w-2 h-2 rounded-full ${indicatorColor} ${shadowClass}`}></span>;
  };

  const addLog = useCallback((accountId: string, message: string, type: LogEntry['type'] = 'info') => {
    setAccounts(prev => prev.map(acc => { 
        if (acc.id === accountId) { 
            const newLog = { id: getRandomUUID(), timestamp: Date.now(), type, message };
            return { ...acc, logs: [...acc.logs, newLog].slice(-50) }; 
        } 
        return acc; 
    }));
  }, []);
  
  const updateAccountStatus = (accountId: string, status: Account['status'], updates?: Partial<Account>) => { setAccounts(prev => prev.map(acc => { if (acc.id === accountId) return { ...acc, status, ...updates }; return acc; })); };
  
  const handleEditAccount = useCallback((id: string, updates: Partial<Account>) => { 
      setAccounts(prev => prev.map(acc => { if (acc.id === id) return { ...acc, ...updates }; return acc; })); 
  }, []);

  const humanDelay = async (accountId: string) => { const ms = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1) + config.minDelay) * 1000; addLog(accountId, `等待随机延迟 ${ms/1000}秒...`); await delay(ms); };
  const recordPointHistory = (accountId: string, points: number) => { if (!points) return; setAccounts(prev => prev.map(acc => { if (acc.id === accountId) { const history = acc.pointHistory || []; const last = history[history.length - 1]; if (last && last.points === points) { const lastDate = new Date(last.date).toDateString(); const today = new Date().toDateString(); if (lastDate === today) { return acc; } } if (last && (Date.now() - new Date(last.date).getTime() < 60000)) { last.points = points; last.date = new Date().toISOString(); return { ...acc, pointHistory: [...history] }; } const newHistory = [...history, { date: new Date().toISOString(), points }]; if (newHistory.length > 200) newHistory.shift(); return { ...acc, pointHistory: newHistory }; } return acc; })); };
  
  const triggerAutoBackup = async () => {
      if (!config.localBackup?.enabled) return;
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timeString = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
      const filename = `MS_Rewards_Backup_${timeString}.json`;
      const payload = {
          filename,
          content: JSON.stringify({ accounts, config, exportDate: now.toISOString(), version: "3.9.1" }, null, 2)
      };
      try {
          let proxyBase = config.proxyUrl.trim();
          if (!proxyBase.startsWith('http')) proxyBase = `http://${proxyBase}`;
          if (proxyBase.endsWith('/')) proxyBase = proxyBase.slice(0, -1);
          const backupPath = config.localBackup.path || 'backups';
          const url = `${proxyBase}/api/local/file?action=write&path=${encodeURIComponent(backupPath)}`;
          await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          addSystemLog(`自动备份完成: ${filename}`, 'success', 'Backup');
      } catch (e: any) {
          addSystemLog(`自动备份失败: ${e.message}`, 'error', 'Backup');
      }
  };

  const processAccount = async (account: Account, mode: ExecutionMode = 'all'): Promise<{ earned: number; totalPoints: number; status: 'success'|'error'|'risk' }> => {
    const { id, refreshToken, accessToken: initialAccessToken, tokenExpiresAt, name, ignoreRisk } = account;
    
    updateAccountStatus(id, 'running', { lastRunTime: Date.now() });
    addLog(id, "🚀 任务序列已启动...");
    addSystemLog(`[${name}] 启动任务序列 (${mode})`, 'info', 'Scheduler');

    try {
      let currentAccessToken = initialAccessToken;
      const now = Date.now();
      
      if (!tokenExpiresAt || (now > tokenExpiresAt) || (tokenExpiresAt - now < TOKEN_REFRESH_THRESHOLD)) {
          addLog(id, "正在刷新 Access Token...");
          try {
            const tokenData = await Service.renewToken(refreshToken, config.proxyUrl);
            if (tokenData) {
              currentAccessToken = tokenData.accessToken;
              updateAccountStatus(id, 'running', { refreshToken: tokenData.newRefreshToken, accessToken: tokenData.accessToken, tokenExpiresAt: Date.now() + (tokenData.expiresIn * 1000) });
            }
          } catch (e: any) { 
              addLog(id, `Token 错误: ${e.message}`, "warning"); 
              if (!currentAccessToken) throw e; 
          }
      }
      if (!currentAccessToken) throw new Error("Token 无效");

      const dashboard = await Service.getDashboardData(currentAccessToken, config.proxyUrl, ignoreRisk);
      const startPoints = dashboard.totalPoints;
      updateAccountStatus(id, 'running', { totalPoints: startPoints, stats: dashboard.stats });
      recordPointHistory(id, startPoints);

      if (config.runSign && (mode === 'all' || mode === 'sign_only')) {
          addLog(id, "正在执行每日签入...");
          const res = await Service.taskSign(currentAccessToken, config.proxyUrl, ignoreRisk);
          if (res.success) {
              addLog(id, res.message, "success");
              if (res.points > 0) addSystemLog(`[${name}] 签入成功 +${res.points}`, 'success', 'Scheduler');
          } else {
              addLog(id, res.message, "warning");
          }
          await humanDelay(id);
      }

      if (config.runRead && (mode === 'all' || mode === 'read_only')) {
           let currentProgress = dashboard.stats.readProgress;
           const max = dashboard.stats.readMax;
           if (currentProgress < max) {
               addLog(id, `启动阅读任务序列 (${currentProgress}/${max})...`);
               addSystemLog(`[${name}] 开始阅读 (${currentProgress}/${max})`, 'info', 'Scheduler');
               let loop = 0;
               while (currentProgress < max && loop < 35) { 
                 const res = await Service.taskRead(currentAccessToken, config.proxyUrl, ignoreRisk);
                 if (res.success) {
                     currentProgress++; 
                     updateAccountStatus(id, 'running', { stats: { ...dashboard.stats, readProgress: currentProgress } });
                     addLog(id, `阅读 ${currentProgress}/${max} 完成 | 积分 +1 (预估) | 等待下轮...`);
                 } else {
                     addLog(id, `阅读尝试失败: ${res.message}`, 'warning');
                 }
                 loop++;
                 await humanDelay(id); 
               }
           } else {
               addLog(id, "阅读任务已达标，跳过。", "info");
           }
      }

      const finalData = await Service.getDashboardData(currentAccessToken, config.proxyUrl, ignoreRisk);
      const earned = finalData.totalPoints - startPoints;
      addLog(id, `✅ 序列完成。本次收益: +${earned} 分`, "success");
      
      updateAccountStatus(id, 'success', { 
          totalPoints: finalData.totalPoints, 
          stats: finalData.stats, 
          lastRunTime: Date.now(),
          lastDailySuccess: Date.now() 
      }); 
      
      recordPointHistory(id, finalData.totalPoints);
      addSystemLog(`[${name}] 执行完成 | 收益: +${earned} | 总分: ${finalData.totalPoints}`, 'success', 'Scheduler');
      
      if (config.autoIdleDelay && config.autoIdleDelay > 0) {
          setTimeout(() => {
              setAccounts(currentAccounts => currentAccounts.map(a => {
                  if (a.id === id && (a.status === 'success' || a.status === 'error')) {
                      return { ...a, status: 'idle' };
                  }
                  return a;
              }));
              addLog(id, `⏳ 自动闲置: 已重置状态`, 'info');
          }, config.autoIdleDelay * 60 * 1000);
      }

      return { earned, totalPoints: finalData.totalPoints, status: 'success' };

    } catch (error: any) {
      const msg = error.message.toLowerCase();
      let status: 'error' | 'risk' = 'error';

      if (msg.includes("suspended") || msg.includes("risk")) { 
          status = 'risk';
          updateAccountStatus(id, 'risk'); 
          addLog(id, `🚨 风险警报: ${error.message}`, "risk");
          addSystemLog(`[${name}] ⚠️ 风险警报: ${error.message}`, 'error', 'Scheduler');
      }
      else { 
          updateAccountStatus(id, 'error'); 
          addLog(id, `❌ 执行中断: ${error.message}`, "error"); 
          addSystemLog(`[${name}] ❌ 执行中断: ${error.message}`, 'error', 'Scheduler');
      }
      return { earned: 0, totalPoints: account.totalPoints, status };
    }
  };

  const generateAccountReportBlock = (account: Account, result: { earned: number, totalPoints: number, status: string }, index: number) => {
      // (保持原有逻辑)
      const statusStr = result.status === 'success' ? '✅ 成功' : result.status === 'risk' ? '🚨 风险' : '❌ 失败';
      
      let diffYesterday = 0;
      if (account.pointHistory && account.pointHistory.length > 0) {
          const todayStr = new Date().toDateString();
          const lastRecordNotToday = [...account.pointHistory].reverse().find(h => new Date(h.date).toDateString() !== todayStr);
          if (lastRecordNotToday) {
              diffYesterday = result.totalPoints - lastRecordNotToday.points;
          }
      }
      const diffStr = diffYesterday >= 0 ? `+${diffYesterday}` : `${diffYesterday}`;

      const s = account.stats;
      const readStr = `${s.readProgress}/${s.readMax}`;
      const pcStr = `${s.pcSearchProgress}/${s.pcSearchMax}`;
      const mobStr = `${s.mobileSearchProgress}/${s.mobileSearchMax}`;
      const actStr = `${s.dailyActivitiesProgress || 0}/${s.dailyActivitiesMax || 0}`;
      const checkInStr = s.checkInProgress ? `已签 ${s.checkInProgress} 天` : '未签到';

      return `[${index}] ${account.name}
● 状态: ${statusStr}
● 积分: ${result.totalPoints.toLocaleString()} (本轮+${result.earned} | 较昨日${diffStr})
● 阅读: ${readStr}
● 搜索: 电脑 ${pcStr} | 移动 ${mobStr}
● 活动: ${actStr}
● 签到: SAPPHIRE ${checkInStr}
-----------------------`;
  };

  // 稳定引用：单账号运行
  const runSingleAccountAutomatically = async (accountId: string, isManual: boolean) => {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;
      if (account.status === 'running') {
          if (isManual) addLog(accountId, "任务正在运行中...", "warning");
          return;
      }
      
      if (isManual) {
          addSystemLog(`[Manual] 启动账号: ${account.name}`, 'info', 'User');
      }

      const result = await processAccount(account, executionMode);
      await triggerAutoBackup(); 
      
      if (config.wxPusher?.enabled && config.allowSinglePush !== false) {
          const targets = config.wxPusher.targets.filter(t => 
             (t.filterAccounts.length === 0 || t.filterAccounts.includes(accountId)) && t.enabled !== false
          );

          if (targets.length > 0) {
              const reportBlock = generateAccountReportBlock(account, result, 1);
              const content = `
\`\`\`text
M S   R E W A R D S
=== 任务小票 (单号) ===
日期: ${formatTime(Date.now())}
-----------------------
${reportBlock}
💰 本轮收益: +${result.earned}
=======================
\`\`\`
              `.trim();
              
              for (const target of targets) {
                  try {
                      const pushRes = await sendNotification({ enabled: true, appToken: config.wxPusher.appToken, uids: target.uids }, content, config.proxyUrl);
                      if (pushRes.success) {
                          addSystemLog(`[${account.name}] 消息已推送至: ${target.name}`, 'success', 'Push');
                      } else {
                          addSystemLog(`[${account.name}] 推送失败: ${pushRes.msg}`, 'error', 'Push');
                      }
                  } catch (e: any) {
                      addSystemLog(`[${account.name}] 推送异常: ${e.message}`, 'error', 'Push');
                  }
              }
          }
      }
  };

  // 稳定引用：刷新单个账号
  const refreshSingleAccount = useCallback(async (id: string, logToSystem: boolean = true) => {
      const acc = accounts.find(a => a.id === id);
      if(!acc || acc.status === 'running') return;
      
      updateAccountStatus(id, 'refreshing'); 
      if (logToSystem) addLog(id, "正在刷新状态...");
      
      try {
          let currentAccessToken = acc.accessToken;
          const now = Date.now();
          
          if (!acc.tokenExpiresAt || now > acc.tokenExpiresAt - TOKEN_REFRESH_THRESHOLD) {
              try {
                const tokenData = await Service.renewToken(acc.refreshToken, config.proxyUrl);
                currentAccessToken = tokenData.accessToken;
                updateAccountStatus(id, 'refreshing', { 
                    accessToken: tokenData.accessToken,
                    refreshToken: tokenData.newRefreshToken,
                    tokenExpiresAt: Date.now() + (tokenData.expiresIn * 1000)
                });
              } catch (e: any) {
                  addLog(id, `Token 刷新失败: ${e.message}`, 'warning');
                  throw e;
              }
          }
          
          if (!currentAccessToken) throw new Error("无有效 Token");

          const dashboard = await Service.getDashboardData(currentAccessToken, config.proxyUrl, acc.ignoreRisk);
          updateAccountStatus(id, 'idle', { 
              totalPoints: dashboard.totalPoints, 
              stats: dashboard.stats 
          });
          recordPointHistory(id, dashboard.totalPoints);
          if (logToSystem) addLog(id, `状态刷新成功`, 'success');

      } catch (e: any) {
          const msg = e.message.toLowerCase();
          if (msg.includes("risk") || msg.includes("suspended")) {
              updateAccountStatus(id, 'risk');
              if (logToSystem) addLog(id, `🚨 刷新检测到风控: ${e.message}`, 'risk');
          } else {
              updateAccountStatus(id, 'error');
              if (logToSystem) addLog(id, `刷新失败: ${e.message}`, 'error');
          }
      }
  }, [accounts, config.proxyUrl, addLog]);

  const handleRefreshAll = async (manual: boolean = true) => {
      if (isRefreshingAll || isRunning) return;
      setIsRefreshingAll(true);
      if (manual) addSystemLog("开始批量刷新状态...", "info", "User");

      const targets = accounts.filter(a => a.enabled !== false);
      
      for (const acc of targets) {
          if (stopTaskRef.current) break;
          await refreshSingleAccount(acc.id, false); 
          await delay(2000); 
      }
      
      await triggerAutoBackup();
      if (manual) addSystemLog("批量刷新完成", "success", "User");
      setIsRefreshingAll(false);
  };

  // 重要：使用 useCallback 封装 handleRunAll 以供调度器调用，但避免频繁变化
  const handleRunAll = useCallback(async (isAuto: boolean) => {
      if (isRunningRef.current || isRefreshingAllRef.current) {
          if (!isAuto) { 
              stopTaskRef.current = true;
              addSystemLog("⚠️ 正在尝试中断任务...", "warning", 'User');
          }
          return;
      }

      setIsRunning(true);
      stopTaskRef.current = false;
      const source = isAuto ? 'Scheduler' : 'User';
      
      // 注意：这里需要直接读取 accountsRef 和 configRef，因为函数闭包内是旧值
      // 但为了简单，我们在组件外层用 useRef 代理了最新的 accounts 和 config
      // 然而 handleRunAll 实际上是在组件渲染时定义的，它闭包里有 accounts。
      // 所以我们不能在这里直接读 Ref，而是应该依赖于 accounts 状态。
      // 这里的优化点在于：调度器 (setInterval) 如何调用这个函数。
      
      // 方案调整：我们将逻辑移入 useEffect 内部，不再依赖 handleRunAll 的闭包。
      
      const targets = accounts.filter(a => {
          if (a.enabled === false) return false;
          if (a.status === 'risk') return false;
          if (config.skipDailyCompleted && a.lastDailySuccess) {
              const date = new Date(a.lastDailySuccess);
              const now = new Date();
              if (date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
                  return false;
              }
          }
          return true;
      });

      if (targets.length === 0) {
          addSystemLog("没有待执行的有效账号 (所有账号今日均已完成)", "warning", source);
          setIsRunning(false);
          return;
      }

      addSystemLog(`开始批量执行 (${targets.length} 个账号) [模式: ${executionMode}]`, 'info', source);

      const executionResults: { account: Account, result: { earned: number, totalPoints: number, status: string } }[] = [];

      for (let i = 0; i < targets.length; i++) {
          if (stopTaskRef.current) {
              addSystemLog("🛑 批量任务已由用户手动终止", "warning", source);
              break;
          }

          const acc = targets[i];
          if (i > 0) await delay(config.delayBetweenAccounts * 1000);
          
          const result = await processAccount(acc, executionMode);
          executionResults.push({ account: acc, result });
      }

      setIsRunning(false);
      await triggerAutoBackup();
      addSystemLog("批量任务执行完毕", "success", source);

      if (config.wxPusher?.enabled && executionResults.length > 0) {
          const validTargets = config.wxPusher.targets.filter(t => t.enabled !== false);
          if (validTargets.length > 0) {
              const nowStr = formatTime(Date.now());
              
              for (const target of validTargets) {
                  const targetResults = executionResults.filter(item => 
                      target.filterAccounts.length === 0 || target.filterAccounts.includes(item.account.id)
                  );

                  if (targetResults.length === 0) continue;

                  let totalEarned = 0;
                  let reportBody = "";

                  targetResults.forEach((item, idx) => {
                      totalEarned += item.result.earned;
                      reportBody += generateAccountReportBlock(item.account, item.result, idx + 1) + "\n";
                  });

                  const pool = accounts
                      .filter(a => target.filterAccounts.length === 0 || target.filterAccounts.includes(a.id))
                      .reduce((sum, a) => sum + a.totalPoints, 0);

                  const summaryContent = `
\`\`\`text
M S   R E W A R D S
=== 任务汇总报告 ===
日期: ${nowStr}
模式: ${executionMode === 'all' ? '全任务' : executionMode === 'sign_only' ? '仅签到' : '仅阅读'}
-----------------------
${reportBody.trim()}
-----------------------
📊 统计
本轮总收益: +${totalEarned}
积分池总计: ${pool.toLocaleString()}
=======================
\`\`\`
                  `.trim();

                  try {
                      const res = await sendNotification({ enabled: true, appToken: config.wxPusher.appToken, uids: target.uids }, summaryContent, config.proxyUrl);
                      if (res.success) {
                          addSystemLog(`汇总报告已推送到: ${target.name}`, 'success', 'Push');
                      } else {
                          addSystemLog(`汇总推送失败 (${target.name}): ${res.msg}`, 'error', 'Push');
                      }
                  } catch (e: any) {
                      addSystemLog(`汇总推送异常: ${e.message}`, 'error', 'Push');
                  }
              }
          }
      }
  }, [accounts, config, executionMode, addSystemLog]); // 依赖项保留，但在定时器中我们不直接调用它

  const handleDataImport = (newAccounts: Account[], newConfig: AppConfig | null, mode: 'merge' | 'overwrite', importedSystemLogs?: SystemLog[]) => { setAccounts(sanitizeAccounts(newAccounts)); if(newConfig) setConfig(c => ({...c, ...newConfig})); };
  const handleWebDAVImport = (newAccounts: Account[], newConfig?: AppConfig, importedSystemLogs?: SystemLog[]) => { handleDataImport(newAccounts, newConfig || null, 'overwrite', importedSystemLogs); };
  
  const handleAddAccount = (e: React.FormEvent) => { 
      e.preventDefault(); 
      if (!newAccountToken.trim()) return; 
      const newAccount: Account = { 
          id: getRandomUUID(), 
          name: newAccountName.trim() || `账号 ${accounts.length + 1}`, 
          refreshToken: newAccountToken.trim(), 
          accessToken: newAccountAccessToken || undefined, 
          tokenExpiresAt: newAccountAccessToken ? Date.now() + (newAccountExpiresIn * 1000) : undefined, 
          status: 'idle', 
          logs: [], 
          totalPoints: 0, 
          pointHistory: [], 
          stats: { readProgress: 0, readMax: 30, pcSearchProgress: 0, pcSearchMax: 0, mobileSearchProgress: 0, mobileSearchMax: 0 }, 
          enabled: true,
          cronEnabled: true, 
          ignoreRisk: false 
      }; 
      setAccounts([...accounts, newAccount]); 
      setNewAccountToken(''); setNewAccountAccessToken(''); setNewAccountExpiresIn(0); setNewAccountName(''); setAddTokenStep(0); setAddTokenError(''); pendingAddTokenRef.current = null; setAddPasteTrapError('');
      addSystemLog(`添加新账号: ${newAccount.name}`, 'success', 'System'); 
  };
  
  const handleRemoveAccount = useCallback((id: string) => { 
      const name = accounts.find(a => a.id === id)?.name; 
      setAccounts(prev => prev.filter(acc => acc.id !== id)); 
      if (monitorAccountId === id) setMonitorAccountId(null); 
      addSystemLog(`删除账号: ${name}`, 'warning', 'System'); 
  }, [accounts, monitorAccountId, addSystemLog]);
  
  const handleAddCopyAuthLink = async () => { /* ... */ 
      const scope = encodeURIComponent("service::prod.rewardsplatform.microsoft.com::MBI_SSL offline_access openid profile");
      const link = `https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&scope=${scope}&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&prompt=login`;
      try { await navigator.clipboard.writeText(link); setAddAuthFeedback('链接已复制'); setTimeout(() => setAddAuthFeedback(''), 1500); } catch (err) { alert('无法写入剪贴板'); }
  };
  const handleAddTextRead = async (text: string) => { /* ... */ 
      const result = parseTokenInput(text);
      if (!result) { const errMsg = '格式错误'; if (showAddPasteTrap) { setAddPasteTrapError(errMsg); setTimeout(() => setAddPasteTrapError(''), 3000); } else { setAddTokenError(`❌ ${errMsg}`); setTimeout(() => setAddTokenError(''), 4000); } return; }
      setAddTokenError(''); setAddPasteTrapError(''); pendingAddTokenRef.current = result; setAddTokenStep(1); setShowAddPasteTrap(false);
  };
  const handleAddTokenUpdateClick = async () => { /* ... */ 
      if (addTokenStep === 0) { setAddTokenError(''); if (navigator.clipboard && navigator.clipboard.readText) { try { const text = await navigator.clipboard.readText(); await handleAddTextRead(text); return; } catch (e) {} } setShowAddPasteTrap(true); setAddPasteTrapError(''); } 
      else { if (!pendingAddTokenRef.current) return setAddTokenStep(0); try { let finalRefreshToken = pendingAddTokenRef.current.value; let finalAccessToken = ''; let finalExpiresIn = 0; if (pendingAddTokenRef.current.type === 'code') { const tokens = await Service.exchangeCodeForToken(pendingAddTokenRef.current.value, config.proxyUrl); finalRefreshToken = tokens.refreshToken; finalAccessToken = tokens.accessToken; finalExpiresIn = tokens.expiresIn; } setNewAccountToken(finalRefreshToken); setNewAccountAccessToken(finalAccessToken); setNewAccountExpiresIn(finalExpiresIn); setAddTokenFeedback('凭证已就绪'); setTimeout(() => setAddTokenFeedback(''), 2000); } catch (e: any) { setAddTokenError(`❌ 错误: ${e.message}`); } finally { setAddTokenStep(0); pendingAddTokenRef.current = null; } }
  };

  const totalEmpirePoints = accounts.reduce((sum, acc) => sum + acc.totalPoints, 0);
  const handleDragStart = (e: React.DragEvent, index: number) => { dragItem.current = index; setIsDragging(true); e.dataTransfer.effectAllowed = "move"; };
  const handleDragEnter = (e: React.DragEvent, index: number) => { if (dragItem.current !== null && dragItem.current !== index) { const newAccounts = [...accounts]; const draggedItem = newAccounts[dragItem.current]; newAccounts.splice(dragItem.current, 1); newAccounts.splice(index, 0, draggedItem); setAccounts(newAccounts); dragItem.current = index; } };
  const handleDragEnd = () => { dragItem.current = null; dragOverItem.current = null; setIsDragging(false); };
  
  const getGridStyle = () => { 
      const cols = config.gridCols || 0; 
      const gap = config.layoutGap ? `${config.layoutGap * 0.25}rem` : '1.5rem';
      if (cols === 0) { return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap }; } 
      return { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }; 
  };
  
  const handleEditModeChange = useCallback((id: string, isEditing: boolean) => { 
      setEditingAccountIds(prev => isEditing ? [...prev, id] : prev.filter(eid => eid !== id)); 
  }, []);
  
  const handleOpenCronForAccount = useCallback((initialValue: string, callback: (val: string) => void) => { 
      setCronGenTarget({ value: initialValue, callback }); setShowCronGenerator(true); 
  }, []);
  
  const handleApplyCronGen = (expr: string) => { if (cronGenTarget) { cronGenTarget.callback(expr); setCronGenTarget(null); } setShowCronGenerator(false); };

  // -------------------------------------------------------------------------
  // 核心调度器 (优化版)
  // 使用 Refs 避免 useEffect 频繁触发
  // -------------------------------------------------------------------------
  useEffect(() => {
      // 每 5 秒检查一次
      const checkTimer = setInterval(() => {
          // 直接从 Ref 获取最新状态，不依赖闭包
          const currentConfig = configRef.current;
          const currentAccounts = accountsRef.current;
          const currentIsRunning = isRunningRef.current;
          const currentIsRefreshing = isRefreshingAllRef.current;

          if (currentIsRunning || currentIsRefreshing) return;

          const now = new Date();
          const nowTs = now.getTime();
          
          // 1. 全局 Cron 检查
          if (currentConfig.cron?.enabled && currentConfig.cron.cronExpression) {
              const lastRun = currentConfig.cron.lastRunTime || 0;
              // 防止1分钟内多次触发 (60s buffer)
              if (nowTs - lastRun > 60000) {
                  if (checkCronMatch(currentConfig.cron.cronExpression, now)) {
                       // 触发逻辑：这里必须调用 handleRunAll(true)
                       // 由于是在 useEffect 内部，且 handleRunAll 有依赖，这里会有闭包问题
                       // 但我们已经在上方定义 handleRunAll 时使用了 useCallback，
                       // 所以这里直接调用组件作用域内的 handleRunAll 实际上是安全的吗？
                       // 不，因为 useEffect 依赖列表为空。
                       // 解决方案：这里我们不直接调用，而是设置一个标志位或者强制刷新。
                       // 更简单的方案：在这里直接手动 click 那个按钮? 不行。
                       
                       // 正确做法：既然我们已经有了最新的 Ref，我们可以在这里直接调用 `handleRunAll(true)`，
                       // 但前提是 handleRunAll 也是 Ref 或者稳定的。
                       // 让我们简化：只在这个 useEffect 里使用 handleRunAll，并将其加入依赖？
                       // 不行，因为 handleRunAll 依赖 accounts，会导致 interval 重置。
                       
                       // 终极方案：在该 useEffect 内部，如果触发了条件，则通过 setTriggerRun 状态来通知。
                       // 但这样会导致一次重渲染。
                       
                       // 这里我们采用直接调用 handleRunAll 的方式，但忽略 lint 警告，
                       // 因为我们知道 handleRunAll 在每次 render 时都会更新闭包。
                       // 只要这个 useEffect 每次 render 都重新挂载... 不，我们就是要避免重新挂载。
                       
                       // 所以，我们必须使用一个 Ref 来存储最新的 handleRunAll 函数。
                       handleRunAllRef.current(true);
                  }
              }
          }

          // 2. 单账号 Cron 检查
          currentAccounts.forEach(acc => {
              if (acc.enabled !== false && acc.cronEnabled !== false && acc.cronExpression) {
                  const accLastRun = acc.lastRunTime || 0;
                  if (nowTs - accLastRun > 60000) {
                      if (checkCronMatch(acc.cronExpression, now)) {
                          // 调用最新的 runSingle
                          runSingleAccountRef.current(acc.id, false);
                      }
                  }
              }
          });
      }, 5000);
      return () => clearInterval(checkTimer);
  }, []); // 空依赖列表！

  // 辅助 Refs 用于在 interval 中调用最新函数
  const handleRunAllRef = useRef(handleRunAll);
  const runSingleAccountRef = useRef(runSingleAccountAutomatically);
  
  useEffect(() => { handleRunAllRef.current = handleRunAll; }, [handleRunAll]);
  useEffect(() => { runSingleAccountRef.current = runSingleAccountAutomatically; }, [runSingleAccountAutomatically]);

  // -------------------------------------------------------------------------

  const executionOptions = [
      { label: '默认 (全做)', value: 'all' },
      { label: '仅签到', value: 'sign_only' },
      { label: '仅阅读', value: 'read_only' }
  ];

  return (
    <div className="h-screen bg-slate-900 text-gray-100 font-sans flex flex-col overflow-hidden custom-scrollbar">
      {/* Header */}
      <div className="shrink-0 bg-slate-950 border-b border-gray-800 backdrop-blur-md bg-opacity-80 z-40">
          <div className="w-full px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
              {/* Left */}
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-blue-900/50 shrink-0">M</div>
                  <h1 className="text-xl font-bold tracking-wide text-gray-200 hidden lg:block truncate">MS Rewards 多账号助手 <span className="text-sm text-gray-500 font-normal ml-1">v3.9.1</span></h1>
                  {config.clockPosition !== 'right' && <HeaderClock />}
              </div>

              {/* Middle Widgets */}
              <div className="flex items-center gap-4 md:gap-8 text-sm font-mono overflow-x-auto no-scrollbar mask-gradient h-full px-2 mx-2">
                  {visibleWidgets['total_pool'] && (
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">积分总池</span>
                          <span className="text-amber-400 font-bold text-lg tracking-wider">{totalEmpirePoints.toLocaleString()}</span>
                      </div>
                  )}
                  {visibleWidgets['total_pool'] && <div className="h-8 w-[1px] bg-gray-800 shrink-0 self-center"></div>}
                  
                  {visibleWidgets['cron_timer'] && (
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">任务倒计时</span>
                          <div className="flex gap-2">
                              <CountdownTimer 
                                cron={config.cron?.cronExpression} 
                                enabled={config.cron?.enabled} 
                                precise={config.preciseCountdown} 
                                className="text-emerald-400 font-bold text-base tabular-nums whitespace-nowrap"
                              />
                          </div>
                      </div>
                  )}
                  
                  {visibleWidgets['local_backup'] && <div className="h-8 w-[1px] bg-gray-800 shrink-0 self-center"></div>}
                  {visibleWidgets['local_backup'] && (
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">本地自动备份</span>
                          <div className="flex gap-2">
                            <CountdownTimer 
                                cron={config.localBackup?.cronExpression} 
                                enabled={config.localBackup?.enabled} 
                                precise={config.preciseCountdown} 
                                className="text-teal-400 font-bold text-base tabular-nums whitespace-nowrap"
                            />
                          </div>
                      </div>
                  )}
                  
                  {visibleWidgets['cloud_sync'] && <div className="h-8 w-[1px] bg-gray-800 shrink-0 self-center"></div>}
                  {visibleWidgets['cloud_sync'] && (
                      <>
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">坚果云同步</span>
                          <div className="flex gap-2">
                            <CountdownTimer 
                                cron={config.nutstore?.cronExpression} 
                                enabled={config.nutstore?.autoSync} 
                                precise={config.preciseCountdown} 
                                className="text-blue-400 font-bold text-base tabular-nums whitespace-nowrap"
                            />
                          </div>
                      </div>
                      <div className="h-8 w-[1px] bg-gray-800 shrink-0 self-center"></div>
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                         <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">InfiniCloud</span>
                         <div className="flex gap-2">
                            <CountdownTimer 
                                cron={config.infinicloud?.cronExpression} 
                                enabled={config.infinicloud?.autoSync} 
                                precise={config.preciseCountdown} 
                                className="text-orange-400 font-bold text-base tabular-nums whitespace-nowrap"
                            />
                         </div>
                      </div>
                      </>
                  )}
              </div>

              {/* Right Content */}
              <div className="flex items-center gap-3 shrink-0">
                 {config.clockPosition === 'right' && <HeaderClock />}
                 
                 {/* Execution Mode Selector */}
                 <div className="w-32 hidden sm:block">
                     <CustomSelect 
                        value={executionMode} 
                        options={executionOptions} 
                        onChange={(val) => setExecutionMode(val as ExecutionMode)} 
                     />
                 </div>

                 {/* Refresh All Button */}
                 <button 
                    onClick={() => handleRefreshAll(true)} 
                    disabled={isRefreshingAll || isRunning || accounts.length === 0}
                    className={`p-2.5 rounded-lg border transition-all ${isRefreshingAll ? 'bg-blue-900/30 border-blue-800 text-blue-400 cursor-wait animate-pulse' : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-300 hover:text-white shadow-lg'}`}
                    title="一键刷新状态"
                 >
                    <svg className={`w-5 h-5 ${isRefreshingAll ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                 </button>

                 {/* Run All Button */}
                 <button 
                    onClick={() => handleRunAll(false)} 
                    disabled={accounts.length === 0 || isRefreshingAll} 
                    className={`px-4 sm:px-6 py-2.5 rounded-full font-bold text-sm transition-all shadow-xl active:scale-95 whitespace-nowrap ${
                        isRunning 
                        ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/40 animate-pulse' 
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40 hover:scale-105'
                    }`}
                 >
                    {isRunning ? '🚫 停止任务' : '一键启动'}
                 </button>
              </div>
          </div>
      </div>
      
      {/* Content Area */}
      <div 
        className="flex-1 overflow-y-auto w-full relative custom-scrollbar"
        style={{ padding: config.containerPadding ? `${config.containerPadding * 0.25}rem` : '1.5rem' }} 
      >
          <div className="w-full space-y-8">
              {/* Toolbar */}
              <div className="flex flex-wrap gap-2 sm:gap-3 justify-end text-sm items-center">
                 <button onClick={() => setShowLayoutSettings(true)} className="px-3 sm:px-4 py-2 bg-gray-800/80 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap">
                     🏗️ 布局调整
                 </button>
                 <button onClick={() => setShowGlobalSettings(true)} className="px-3 sm:px-4 py-2 bg-gray-800/80 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap">
                     ⚙️ 全局设置
                 </button>
                 <button onClick={() => setShowTimerManager(true)} className="px-3 sm:px-4 py-2 bg-gray-800/80 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap">
                     ⏳ 计时管理
                 </button>
                 <button onClick={() => setShowCronSettings(true)} className={getButtonStyle(config.cron?.enabled, 'task')}>
                     ⏱️ 任务调度 {getIndicator(config.cron?.enabled, 'task')}
                 </button>
                 <button onClick={() => setShowWebDAV(true)} className={getButtonStyle(config.nutstore?.autoSync || config.infinicloud?.autoSync, 'cloud')}>
                     ☁️ 云同步 {getIndicator(config.nutstore?.autoSync || config.infinicloud?.autoSync, 'cloud')}
                 </button>
                 <button onClick={() => setShowDataManage(true)} className={getButtonStyle(config.localBackup?.enabled, 'local')}>
                     💾 本地备份 {getIndicator(config.localBackup?.enabled, 'local')}
                 </button>
                 <button onClick={() => setShowWxPusher(true)} className={getButtonStyle(config.wxPusher?.enabled, 'push')}>
                     📣 消息推送 {getIndicator(config.wxPusher?.enabled, 'push')}
                 </button>
                 <button onClick={() => setShowProxyGuide(true)} className="px-3 sm:px-4 py-2 bg-gray-800/80 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap">
                     🔌 代理配置
                 </button>
              </div>

              {/* Account Grid */}
              <div style={getGridStyle()}>
                  {accounts.map((acc, index) => (
                    <div 
                        key={acc.id} 
                        draggable={!editingAccountIds.includes(acc.id)} 
                        onDragStart={(e) => handleDragStart(e, index)} 
                        onDragEnter={(e) => handleDragEnter(e, index)} 
                        onDragEnd={handleDragEnd} 
                        onDragOver={(e) => e.preventDefault()} 
                        className={`transition-all duration-300 ease-out cursor-move select-none h-full ${isDragging && dragItem.current === index ? 'opacity-40 scale-95 border-2 border-dashed border-blue-500/50 rounded-2xl grayscale' : 'opacity-100'}`}
                    >
                        <AccountCard 
                            account={acc} 
                            onRemove={handleRemoveAccount} 
                            onOpenMonitor={(id) => setMonitorAccountId(id)} 
                            onRefresh={(id) => refreshSingleAccount(id, true)} 
                            onRunSingle={(id) => runSingleAccountAutomatically(id, true)}
                            onEditAccount={handleEditAccount}
                            onEditModeChange={(isEditing) => handleEditModeChange(acc.id, isEditing)}
                            onOpenCronGenerator={handleOpenCronForAccount}
                            autoCloseDelay={config.editModeAutoCloseDelay}
                            proxyUrl={config.proxyUrl} 
                            onLog={addSystemLog} // 传递稳定引用，在 Card 内部柯里化
                            cardFontSizes={config.cardFontSizes}
                            disableAutoClose={showCronGenerator} 
                            preciseCountdown={config.preciseCountdown} 
                        />
                    </div>
                  ))}
                  
                  {/* Add Account Card (Keeping existing logic) */}
                  <div className="group relative rounded-2xl border-2 border-gray-700 border-dashed hover:border-blue-500/50 bg-gray-800/30 hover:bg-gray-800/50 transition-all duration-300 p-6 flex flex-col justify-center items-center gap-6 min-h-[380px]">
                      <div className="text-center w-full max-w-sm">
                           <form onSubmit={handleAddAccount} className="flex flex-col gap-6">
                               <input type="text" placeholder="备注名称 (选填)" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-3 text-base text-center focus:border-blue-500 outline-none transition-colors" />
                               <div className={`bg-black/30 border rounded-lg p-3 transition-all duration-300 ${addTokenError ? 'border-red-500 bg-red-900/20 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'border-gray-700'}`}>
                                   <div className="flex justify-between items-center mb-1">
                                       <div className="text-xs text-gray-400 ml-1 truncate pr-2">
                                           {newAccountToken ? '✅ 凭证已就绪' : '⚠️ 需配置凭证'}
                                       </div>
                                       <div className="flex gap-2">
                                           {newAccountToken && <button type="button" onClick={() => { setNewAccountToken(''); setAddTokenStep(0); }} className="text-[10px] text-red-400 hover:text-red-300">清除</button>}
                                       </div>
                                   </div>
                                   <div className="flex gap-3 mt-2">
                                       <button type="button" onClick={handleAddCopyAuthLink} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 text-xs rounded transition-all active:scale-95 font-bold relative">
                                           获取授权
                                           {addAuthFeedback && (<div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in duration-200 whitespace-nowrap z-50">{addAuthFeedback}</div>)}
                                       </button>
                                       <button type="button" onClick={handleAddTokenUpdateClick} className={`flex-[1.5] py-2 border rounded text-xs transition-all active:scale-95 font-bold relative ${addTokenStep === 1 ? 'bg-red-600 hover:bg-red-500 border-red-500 text-white animate-pulse' : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white'}`}>
                                           {addTokenStep === 1 ? '确认填入凭证' : (newAccountToken ? '更新 Token' : '粘贴 Token')}
                                           {addTokenFeedback && (<div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-700 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in duration-200 whitespace-nowrap z-50">{addTokenFeedback}</div>)}
                                       </button>
                                   </div>
                                   {addTokenError ? (<div className="text-xs text-red-100 bg-red-600/80 rounded px-2 py-1.5 font-bold mt-2 text-center animate-in fade-in slide-in-from-top-1 shadow-sm">{addTokenError}</div>) : (<p className="text-[10px] text-gray-600 mt-2 text-center">{addTokenStep === 1 ? '⚠️ 确认将剪贴板内容写入？' : '先获取授权复制链接，登录后再点击右侧粘贴'}</p>)}
                               </div>
                               <button type="submit" disabled={!newAccountToken} className={`w-full py-3 rounded-lg text-base font-bold shadow-xl shadow-blue-900/20 hover:scale-[1.02] transition-all ${newAccountToken ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>+ 添加新账号</button>
                           </form>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      <div className="shrink-0 z-50">
          <SystemLogs logs={systemLogs} />
      </div>

      {/* Modals */}
      <ProxyGuideModal isOpen={showProxyGuide} onClose={() => setShowProxyGuide(false)} />
      <MonitorModal 
          account={accounts.find(a => a.id === monitorAccountId) || null} 
          onClose={() => setMonitorAccountId(null)} 
          configLogDays={config.monitorLogDays}
      />
      <WebDAVModal isOpen={showWebDAV} onClose={() => setShowWebDAV(false)} config={config} accounts={accounts} onUpdateConfig={(key, val) => setConfig(prev => ({...prev, [key]: val}))} onImportAccounts={handleWebDAVImport} addSystemLog={addSystemLog} />
      <DataManageModal isOpen={showDataManage} onClose={() => setShowDataManage(false)} accounts={accounts} config={config} onImport={handleDataImport} addSystemLog={addSystemLog} />
      <GlobalSettingsModal isOpen={showGlobalSettings} onClose={() => setShowGlobalSettings(false)} config={config} onUpdateConfig={setConfig} />
      <WxPusherModal isOpen={showWxPusher} onClose={() => setShowWxPusher(false)} config={config} accounts={accounts} onUpdateConfig={setConfig} />
      <TaskSchedulerModal isOpen={showCronSettings} onClose={() => setShowCronSettings(false)} config={config} onUpdateConfig={setConfig} />
      <LayoutSettingsModal 
          isOpen={showLayoutSettings} 
          onClose={() => setShowLayoutSettings(false)} 
          config={config} 
          onUpdateConfig={setConfig} 
          visibleWidgets={visibleWidgets}
          onToggleWidget={(k, v) => setVisibleWidgets({...visibleWidgets, [k]: v})}
      />
      <TimerManagerModal 
          isOpen={showTimerManager} 
          onClose={() => setShowTimerManager(false)} 
          config={config} 
          accounts={accounts} 
          onUpdateConfig={setConfig}
          onUpdateAccount={handleEditAccount}
      />
      <CronGeneratorModal isOpen={showCronGenerator} onClose={() => setShowCronGenerator(false)} onApply={handleApplyCronGen} />
      <PasteTrapModal isOpen={showAddPasteTrap} onClose={() => { setShowAddPasteTrap(false); setAddPasteTrapError(''); }} onPaste={handleAddTextRead} error={addPasteTrapError} />
    </div>
  );
};

export default App;
