
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
      status: 'idle', 
      logs: Array.isArray(acc.logs) ? acc.logs : [], 
      lastRunTime: acc.lastRunTime,
      totalPoints: typeof acc.totalPoints === 'number' ? acc.totalPoints : 0,
      pointHistory: Array.isArray(acc.pointHistory) ? acc.pointHistory : [],
      stats: {
        readProgress: acc.stats?.readProgress || 0,
        readMax: acc.stats?.readMax || 30,
      },
      enabled: acc.enabled !== false,
      cronEnabled: acc.cronEnabled !== false, // Preserve or Default true
      cronExpression: acc.cronExpression,
      ignoreRisk: acc.ignoreRisk || false // Ensure flag is preserved
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
  
  // 布局可见性配置
  const [visibleWidgets, setVisibleWidgets] = useState<{ [key: string]: boolean }>(() => safeJsonParse('ms_rewards_layout_widgets', {
      total_pool: true,
      cron_timer: true,
      local_backup: true,
      cloud_sync: true
  }));

  useEffect(() => {
      localStorage.setItem('ms_rewards_layout_widgets', JSON.stringify(visibleWidgets));
  }, [visibleWidgets]);

  // 系统日志状态
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const addSystemLog = useCallback((message: string, type: SystemLog['type'] = 'info', source: string = 'System') => {
      setSystemLogs(prev => [...prev, { id: getRandomUUID(), timestamp: Date.now(), type, message, source }].slice(-100)); 
  }, []);

  const [isRunning, setIsRunning] = useState(false);
  const stopTaskRef = useRef(false); // 用于中断批量任务
  
  // 模态框状态
  const [showCronSettings, setShowCronSettings] = useState(false); 
  const [showCronGenerator, setShowCronGenerator] = useState(false); 
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [showWxPusher, setShowWxPusher] = useState(false);
  const [showTimerManager, setShowTimerManager] = useState(false); 
  const [showLayoutSettings, setShowLayoutSettings] = useState(false);
  
  const [cronGenTarget, setCronGenTarget] = useState<{ value: string, callback: (val: string) => void } | null>(null);

  // 倒计时标签
  const [nextRunLabel, setNextRunLabel] = useState('未开启');
  const [nextSyncLabelNutstore, setNextSyncLabelNutstore] = useState('未开启'); 
  const [nextSyncLabelInfini, setNextSyncLabelInfini] = useState('未开启');
  const [nextLocalBackupLabel, setNextLocalBackupLabel] = useState('未开启'); 
  
  // HUD 系统时钟
  const [systemTime, setSystemTime] = useState(new Date());

  // 拖拽排序状态
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingAccountIds, setEditingAccountIds] = useState<string[]>([]);
  
  const syncLocksRef = useRef<{ [key: string]: boolean }>({});

  // 添加账号表单
  const [newAccountToken, setNewAccountToken] = useState('');
  const [newAccountAccessToken, setNewAccountAccessToken] = useState(''); 
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountExpiresIn, setNewAccountExpiresIn] = useState(0);
  
  // 添加账号 - Token 处理状态
  const [addTokenStep, setAddTokenStep] = useState<0 | 1>(0);
  const [addAuthFeedback, setAddAuthFeedback] = useState('');
  const [addTokenFeedback, setAddTokenFeedback] = useState('');
  const [addTokenError, setAddTokenError] = useState(''); // Token 错误显示
  const pendingAddTokenRef = useRef<{ type: 'code' | 'token', value: string } | null>(null);
  
  // Paste Trap
  const [showAddPasteTrap, setShowAddPasteTrap] = useState(false);
  const [addPasteTrapError, setAddPasteTrapError] = useState(''); // Modal内部错误

  // 弹窗状态
  const [showProxyGuide, setShowProxyGuide] = useState(false);
  const [showWebDAV, setShowWebDAV] = useState(false);
  const [showDataManage, setShowDataManage] = useState(false);
  const [monitorAccountId, setMonitorAccountId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => { localStorage.setItem('ms_rewards_accounts', JSON.stringify(accounts)); }, [accounts]);
  useEffect(() => { localStorage.setItem('ms_rewards_config', JSON.stringify(config)); }, [config]);

  // HUD 时钟
  useEffect(() => {
      const timer = setInterval(() => setSystemTime(new Date()), 30); 
      return () => clearInterval(timer);
  }, []);

  const ClockComponent = () => (
      <div className="hidden lg:flex items-center ml-4 px-4 py-2 bg-black rounded-lg border border-gray-800 shadow-[0_0_20px_-5px_rgba(6,182,212,0.2)] font-mono gap-3 select-none group hover:border-cyan-500/50 transition-colors">
          <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]"></span>
              <span className="text-xl font-bold text-gray-100 tracking-widest text-shadow-glow">
                  {systemTime.toLocaleTimeString('en-US', {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'})}
              </span>
          </div>
          <div className="flex flex-col justify-center border-l border-gray-700 pl-3 h-8">
              <span className="text-[10px] text-gray-500 font-bold uppercase leading-none mb-0.5">MS</span>
              <span className="text-sm text-cyan-500 font-bold leading-none w-8 tabular-nums">
                  {systemTime.getMilliseconds().toString().padStart(3, '0')}
              </span>
          </div>
      </div>
  );

  // 辅助函数：根据开关状态生成按钮样式
  const getButtonStyle = (enabled: boolean | undefined, type: keyof typeof FEATURE_COLORS) => {
      const colors = FEATURE_COLORS[type];
      const indicatorColor = config.forceGreenIndicators ? 'bg-green-500' : colors.dot;
      
      let baseClass = 'px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 shadow-sm relative whitespace-nowrap';
      
      if (config.showButtonHighlight && enabled) {
          // 高亮模式
          return `${baseClass} ${colors.bg} ${colors.border} ${colors.text}`;
      }
      
      // 默认模式
      return `${baseClass} bg-gray-800/80 border-gray-700 text-gray-300 hover:border-gray-500`;
  };

  const getIndicator = (enabled: boolean | undefined, type: keyof typeof FEATURE_COLORS) => {
      if (!enabled) return null;
      const colors = FEATURE_COLORS[type];
      const indicatorColor = config.forceGreenIndicators ? 'bg-green-500' : colors.dot;
      // 如果未开启高亮，给指示灯加点光晕
      const shadowClass = !config.showButtonHighlight ? 'shadow-[0_0_8px_rgba(255,255,255,0.4)]' : '';
      return <span className={`w-2 h-2 rounded-full ${indicatorColor} ${shadowClass}`}></span>;
  };

  // ... (Core logic restoration) ...
  useEffect(() => {
    const calculateCountdown = (expression: string | undefined, enabled: boolean | undefined) => {
         if (!enabled || !expression) return '未开启';
         const nextDate = getNextRunDate(expression);
         if (!nextDate) return '配置错误';
         const now = new Date();
         const diff = nextDate.getTime() - now.getTime();
         return formatDuration(diff, config.preciseCountdown);
    };
    const updateCountdowns = () => {
        setNextRunLabel(calculateCountdown(config.cron?.cronExpression, config.cron?.enabled));
        setNextSyncLabelNutstore(calculateCountdown(config.nutstore?.cronExpression, config.nutstore?.autoSync));
        setNextSyncLabelInfini(calculateCountdown(config.infinicloud?.cronExpression, config.infinicloud?.autoSync));
        setNextLocalBackupLabel(calculateCountdown(config.localBackup?.cronExpression, config.localBackup?.enabled));
    };
    updateCountdowns(); 
    const timer = setInterval(updateCountdowns, 1000); 
    return () => clearInterval(timer);
  }, [config, isRunning]);

  // ... (Rest of component functions omitted for brevity, identical to previous file except AccountCard prop)

  const addLog = (accountId: string, message: string, type: LogEntry['type'] = 'info') => {
    setAccounts(prev => prev.map(acc => { if (acc.id === accountId) { return { ...acc, logs: [...acc.logs, { id: getRandomUUID(), timestamp: Date.now(), type, message }] }; } return acc; }));
  };
  const updateAccountStatus = (accountId: string, status: Account['status'], updates?: Partial<Account>) => { setAccounts(prev => prev.map(acc => { if (acc.id === accountId) return { ...acc, status, ...updates }; return acc; })); };
  const handleEditAccount = (id: string, updates: Partial<Account>) => { setAccounts(prev => prev.map(acc => { if (acc.id === id) return { ...acc, ...updates }; return acc; })); };
  const humanDelay = async (accountId: string) => { const ms = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1) + config.minDelay) * 1000; addLog(accountId, `等待随机延迟 ${ms/1000}秒...`); await delay(ms); };
  const recordPointHistory = (accountId: string, points: number) => { if (!points) return; setAccounts(prev => prev.map(acc => { if (acc.id === accountId) { const history = acc.pointHistory || []; const last = history[history.length - 1]; if (last && last.points === points) { const lastDate = new Date(last.date).toDateString(); const today = new Date().toDateString(); if (lastDate === today) { return acc; } } if (last && (Date.now() - new Date(last.date).getTime() < 60000)) { last.points = points; last.date = new Date().toISOString(); return { ...acc, pointHistory: [...history] }; } const newHistory = [...history, { date: new Date().toISOString(), points }]; if (newHistory.length > 200) newHistory.shift(); return { ...acc, pointHistory: newHistory }; } return acc; })); };
  
  const processAccount = async (account: Account): Promise<{ earned: number; totalPoints: number; status: 'success'|'error'|'risk' }> => {
    const { id, refreshToken, accessToken: initialAccessToken, tokenExpiresAt, name, ignoreRisk } = account;
    
    updateAccountStatus(id, 'running', { lastRunTime: Date.now() });
    addLog(id, "🚀 任务序列已启动...");
    addSystemLog(`[${name}] 启动任务序列`, 'info', 'Scheduler');

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

      // Pass ignoreRisk to service
      const dashboard = await Service.getDashboardData(currentAccessToken, config.proxyUrl, ignoreRisk);
      const startPoints = dashboard.totalPoints;
      updateAccountStatus(id, 'running', { totalPoints: startPoints, stats: dashboard.stats });
      recordPointHistory(id, startPoints);

      if (config.runSign) {
          addLog(id, "正在执行每日签入...");
          // Pass ignoreRisk
          const res = await Service.taskSign(currentAccessToken, config.proxyUrl, ignoreRisk);
          if (res.success) {
              addLog(id, res.message, "success");
              if (res.points > 0) addSystemLog(`[${name}] 签入成功 +${res.points}`, 'success', 'Scheduler');
          } else {
              addLog(id, res.message, "warning");
          }
          await humanDelay(id);
      }

      if (config.runRead) {
           let currentProgress = dashboard.stats.readProgress;
           const max = dashboard.stats.readMax;
           if (currentProgress < max) {
               addLog(id, `启动阅读任务序列 (${currentProgress}/${max})...`);
               addSystemLog(`[${name}] 开始阅读 (${currentProgress}/${max})`, 'info', 'Scheduler');
               let loop = 0;
               while (currentProgress < max && loop < 35) { 
                 // Pass ignoreRisk
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

      // Final Check (Pass ignoreRisk)
      const finalData = await Service.getDashboardData(currentAccessToken, config.proxyUrl, ignoreRisk);
      const earned = finalData.totalPoints - startPoints;
      addLog(id, `✅ 序列完成。本次收益: +${earned} 分`, "success");
      updateAccountStatus(id, 'success', { totalPoints: finalData.totalPoints, stats: finalData.stats, lastRunTime: Date.now() }); 
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

  // 生成单条账号的报告内容 (重构复用)
  const generateAccountReportBlock = (account: Account, result: { earned: number, totalPoints: number, status: string }, index: number) => {
      const statusStr = result.status === 'success' ? '✅ 执行成功' : result.status === 'risk' ? '🚨 风险警报' : '❌ 执行失败';
      
      // 计算较昨日变化 (Diff)
      let diff = 0;
      let hasHistory = false;
      if (account.pointHistory && account.pointHistory.length > 0) {
          const todayStr = new Date().toDateString();
          const lastRecordNotToday = [...account.pointHistory].reverse().find(h => new Date(h.date).toDateString() !== todayStr);
          if (lastRecordNotToday) {
              diff = result.totalPoints - lastRecordNotToday.points;
              hasHistory = true;
          }
      }
      const diffStr = hasHistory ? (diff >= 0 ? `+${diff}` : `${diff}`) : '+0';

      return `[${index}] ${account.name}
● 运行状态: ${statusStr}
● 当前积分: ${result.totalPoints.toLocaleString()}
● 本轮收益: +${result.earned}
● 较昨变化: ${diffStr}
-----------------------`;
  };

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

      const result = await processAccount(account);
      
      // 单独运行时，根据全局配置决定是否推送
      // 如果全局配置允许单任务推送 (config.allowSinglePush !== false)，并且 WxPusher 启用
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
💰 本轮收益: ${result.earned}
🏆 积分总池: ${result.totalPoints.toLocaleString()}
=======================
\`\`\`
              `.trim();
              
              for (const target of targets) {
                  try {
                      const pushRes = await sendNotification({
                          enabled: true,
                          appToken: config.wxPusher.appToken,
                          uids: target.uids
                      }, content, config.proxyUrl);
                      
                      if (pushRes.success) {
                          addSystemLog(`[${account.name}] 消息已推送至: ${target.name}`, 'success', 'Push');
                      } else {
                          addSystemLog(`[${account.name}] 推送失败 (${target.name}): ${pushRes.msg}`, 'error', 'Push');
                      }
                  } catch (e: any) {
                      console.error("Push failed", e);
                      addSystemLog(`[${account.name}] 推送异常: ${e.message}`, 'error', 'Push');
                  }
              }
          }
      }
  };

  // 重构后的批量执行逻辑
  const handleRunAll = async (isAuto: boolean) => {
      if (isRunning) {
          // 如果正在运行，点击按钮触发停止
          if (!isAuto) { // 只有手动点击按钮才能停止
              stopTaskRef.current = true;
              addSystemLog("⚠️ 正在尝试中断任务...", "warning", 'User');
          }
          return;
      }

      setIsRunning(true);
      stopTaskRef.current = false;
      const source = isAuto ? 'Scheduler' : 'User';
      
      // 筛选逻辑：排除禁用的账号和风险账号
      // 新增：如果配置了跳过已完成，且今天已运行过，则跳过
      const isToday = (ts: number) => {
          if (!ts) return false;
          const date = new Date(ts);
          const now = new Date();
          return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      };

      const targets = accounts.filter(a => {
          if (a.enabled === false) return false;
          if (a.status === 'risk') return false;
          
          if (config.skipDailyCompleted && a.lastRunTime && isToday(a.lastRunTime)) {
              // 自动跳过今日已完成
              return false;
          }
          return true;
      });

      if (targets.length === 0) {
          const msg = config.skipDailyCompleted ? "所有启用账号今日均已签到 (或无待执行账号)" : "没有待执行的有效账号";
          addSystemLog(msg, "warning", source);
          setIsRunning(false);
          return;
      }

      addSystemLog(`开始批量执行 (${targets.length} 个账号)`, 'info', source);

      const executionResults: { account: Account, result: { earned: number, totalPoints: number, status: string } }[] = [];

      for (let i = 0; i < targets.length; i++) {
          if (stopTaskRef.current) {
              addSystemLog("🛑 批量任务已由用户手动终止", "warning", source);
              break;
          }

          const acc = targets[i];
          if (i > 0) {
              await delay(config.delayBetweenAccounts * 1000);
          }
          
          // 执行任务但不推送 (获取结果)
          const result = await processAccount(acc);
          executionResults.push({ account: acc, result });
      }

      setIsRunning(false);
      
      if (stopTaskRef.current) {
          // 如果被停止，不发送汇总推送，或者发送部分汇总
          addSystemLog("任务队列未完全执行", "warning", source);
      } else {
          addSystemLog("批量任务执行完毕", "success", source);
      }

      // === 批量执行完毕，统一推送 ===
      if (config.wxPusher?.enabled && executionResults.length > 0) {
          // 获取所有启用的分发目标
          const validTargets = config.wxPusher.targets.filter(t => t.enabled !== false);
          
          if (validTargets.length > 0) {
              const nowStr = formatTime(Date.now());
              
              // 为每个目标生成定制化报告 (因为不同目标可能订阅了不同账号)
              for (const target of validTargets) {
                  // 筛选该目标关注的账号结果
                  const targetResults = executionResults.filter(item => 
                      target.filterAccounts.length === 0 || target.filterAccounts.includes(item.account.id)
                  );

                  if (targetResults.length === 0) continue; // 该目标关注的账号没有在此次任务中执行

                  let totalEarned = 0;
                  let successCount = 0;
                  let failCount = 0;
                  let reportBody = "";

                  targetResults.forEach((item, idx) => {
                      totalEarned += item.result.earned;
                      if (item.result.status === 'success') successCount++; else failCount++;
                      reportBody += generateAccountReportBlock(item.account, item.result, idx + 1) + "\n";
                  });

                  // 计算该目标视角的总积分池 (只包含它关注的账号)
                  const pool = accounts
                      .filter(a => target.filterAccounts.length === 0 || target.filterAccounts.includes(a.id))
                      .reduce((sum, a) => sum + a.totalPoints, 0);

                  const summaryContent = `
\`\`\`text
M S   R E W A R D S
=== 任务汇总报告 ===
日期: ${nowStr}
目标: ${target.name}
-----------------------
${reportBody.trim()}
-----------------------
📊 统计
成功: ${successCount}   失败: ${failCount}
💰 总收益: +${totalEarned}
🏆 关注池: ${pool.toLocaleString()}
=======================
\`\`\`
                  `.trim();

                  try {
                      await sendNotification({
                          enabled: true,
                          appToken: config.wxPusher.appToken,
                          uids: target.uids
                      }, summaryContent, config.proxyUrl);
                      addSystemLog(`汇总报告已推送到: ${target.name}`, 'success', 'Push');
                  } catch (e: any) {
                      console.error("Batch Push failed", e);
                  }
              }
          }
      }
  };

  const refreshSingleAccount = async (id: string) => {
      const acc = accounts.find(a => a.id === id);
      if(!acc || acc.status === 'running') return;
      
      updateAccountStatus(id, 'running');
      addLog(id, "正在刷新状态...");
      
      try {
          let currentAccessToken = acc.accessToken;
          const now = Date.now();
          
          if (!acc.tokenExpiresAt || now > acc.tokenExpiresAt - TOKEN_REFRESH_THRESHOLD) {
              try {
                const tokenData = await Service.renewToken(acc.refreshToken, config.proxyUrl);
                currentAccessToken = tokenData.accessToken;
                updateAccountStatus(id, 'running', {
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

          // Pass ignoreRisk to refresh
          const dashboard = await Service.getDashboardData(currentAccessToken, config.proxyUrl, acc.ignoreRisk);
          updateAccountStatus(id, 'idle', { 
              totalPoints: dashboard.totalPoints, 
              stats: dashboard.stats 
          });
          recordPointHistory(id, dashboard.totalPoints);
          addLog(id, `状态刷新成功`, 'success');

      } catch (e: any) {
          updateAccountStatus(id, 'error');
          addLog(id, `刷新失败: ${e.message}`, 'error');
      }
  };

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
          stats: { readProgress: 0, readMax: 30 }, 
          enabled: true,
          cronEnabled: true, // Init true
          ignoreRisk: false 
      }; 
      setAccounts([...accounts, newAccount]); 
      
      setNewAccountToken(''); 
      setNewAccountAccessToken(''); 
      setNewAccountExpiresIn(0); 
      setNewAccountName(''); 
      setAddTokenStep(0);
      setAddTokenError('');
      pendingAddTokenRef.current = null;
      setAddPasteTrapError('');
      
      addSystemLog(`添加新账号: ${newAccount.name}`, 'success', 'System'); 
  };
  
  const handleRemoveAccount = (id: string) => { const name = accounts.find(a => a.id === id)?.name; setAccounts(prev => prev.filter(acc => acc.id !== id)); if (monitorAccountId === id) setMonitorAccountId(null); addSystemLog(`删除账号: ${name}`, 'warning', 'System'); };
  
  // 新的 Add Account Token 逻辑
  const handleAddCopyAuthLink = async () => {
      const scope = encodeURIComponent("service::prod.rewardsplatform.microsoft.com::MBI_SSL offline_access openid profile");
      const link = `https://login.live.com/oauth20_authorize.srf?client_id=0000000040170455&scope=${scope}&response_type=code&redirect_uri=https://login.live.com/oauth20_desktop.srf&prompt=login`;
      
      try {
          await navigator.clipboard.writeText(link);
          setAddAuthFeedback('链接已复制');
          setTimeout(() => setAddAuthFeedback(''), 1500);
      } catch (err) {
          alert('无法写入剪贴板，请手动复制链接');
      }
  };

  const handleAddTextRead = async (text: string) => {
      const result = parseTokenInput(text);
      if (!result) {
          const errMsg = '格式错误: 需以 M. 开头或为 Auth URL';
          if (showAddPasteTrap) {
              setAddPasteTrapError(errMsg);
              setTimeout(() => setAddPasteTrapError(''), 3000);
          } else {
              setAddTokenError(`❌ ${errMsg}`);
              setTimeout(() => setAddTokenError(''), 4000);
          }
          return;
      }
      
      setAddTokenError('');
      setAddPasteTrapError('');
      pendingAddTokenRef.current = result;
      setAddTokenStep(1);
      setShowAddPasteTrap(false);
  };

  const handleAddTokenUpdateClick = async () => {
      if (addTokenStep === 0) {
          setAddTokenError('');
          // 优先尝试原生 API
          if (navigator.clipboard && navigator.clipboard.readText) {
              try {
                  const text = await navigator.clipboard.readText();
                  await handleAddTextRead(text);
                  return;
              } catch (e) {
                  console.warn("Clipboard API failed, falling back to trap", e);
              }
          }
          
          // 如果失败，打开 Paste Trap
          setShowAddPasteTrap(true);
          setAddPasteTrapError('');

      } else {
          if (!pendingAddTokenRef.current) return setAddTokenStep(0);
          
          try {
              let finalRefreshToken = pendingAddTokenRef.current.value;
              let finalAccessToken = '';
              let finalExpiresIn = 0;
              
              if (pendingAddTokenRef.current.type === 'code') {
                  const tokens = await Service.exchangeCodeForToken(pendingAddTokenRef.current.value, config.proxyUrl);
                  finalRefreshToken = tokens.refreshToken;
                  finalAccessToken = tokens.accessToken;
                  finalExpiresIn = tokens.expiresIn;
              }

              setNewAccountToken(finalRefreshToken);
              setNewAccountAccessToken(finalAccessToken);
              setNewAccountExpiresIn(finalExpiresIn);
              
              setAddTokenFeedback('凭证已就绪');
              setTimeout(() => setAddTokenFeedback(''), 2000);
          } catch (e: any) {
              setAddTokenError(`❌ 错误: ${e.message}`);
          } finally {
              setAddTokenStep(0);
              pendingAddTokenRef.current = null;
          }
      }
  };

  const totalEmpirePoints = accounts.reduce((sum, acc) => sum + acc.totalPoints, 0);
  const handleDragStart = (e: React.DragEvent, index: number) => { dragItem.current = index; setIsDragging(true); e.dataTransfer.effectAllowed = "move"; };
  const handleDragEnter = (e: React.DragEvent, index: number) => { if (dragItem.current !== null && dragItem.current !== index) { const newAccounts = [...accounts]; const draggedItem = newAccounts[dragItem.current]; newAccounts.splice(dragItem.current, 1); newAccounts.splice(index, 0, draggedItem); setAccounts(newAccounts); dragItem.current = index; } };
  const handleDragEnd = () => { dragItem.current = null; dragOverItem.current = null; setIsDragging(false); };
  
  // Use config.layoutGap and config.containerPadding for styles
  const getGridStyle = () => { 
      const cols = config.gridCols || 0; 
      const gap = config.layoutGap ? `${config.layoutGap * 0.25}rem` : '1.5rem';
      if (cols === 0) { 
          // 关键修改: 减小最小宽度至 300px 以适应较小屏幕或高缩放比例
          return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap }; 
      } 
      return { display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }; 
  };
  
  const handleEditModeChange = (id: string, isEditing: boolean) => { setEditingAccountIds(prev => isEditing ? [...prev, id] : prev.filter(eid => eid !== id)); };
  const handleOpenCronForAccount = (initialValue: string, callback: (val: string) => void) => { setCronGenTarget({ value: initialValue, callback }); setShowCronGenerator(true); };
  const handleApplyCronGen = (expr: string) => { if (cronGenTarget) { cronGenTarget.callback(expr); setCronGenTarget(null); } setShowCronGenerator(false); };

  // 全局调度 Effect
  useEffect(() => {
      const checkTimer = setInterval(() => {
          const now = new Date();
          const nowTs = now.getTime();
          
          if (config.cron?.enabled && config.cron.cronExpression && !isRunning) {
              const lastRun = config.cron.lastRunTime || 0;
              if (checkCronMatch(config.cron.cronExpression, now)) {
                   if (nowTs - lastRun > 60000) handleRunAll(true);
              }
          }

          accounts.forEach(acc => {
              // 只有当账户启用，且独立定时器也启用时，才触发
              if (acc.enabled !== false && acc.cronEnabled !== false && acc.cronExpression) {
                  const accLastRun = acc.lastRunTime || 0;
                  if (checkCronMatch(acc.cronExpression, now)) {
                      if (nowTs - accLastRun > 60000) {
                          runSingleAccountAutomatically(acc.id, false);
                      }
                  }
              }
          });
      }, 5000);
      return () => clearInterval(checkTimer);
  }, [config, isRunning, handleRunAll, systemLogs]);

  return (
    <div className="h-screen bg-slate-900 text-gray-100 font-sans flex flex-col overflow-hidden custom-scrollbar">
      {/* Header */}
      <div className="shrink-0 bg-slate-950 border-b border-gray-800 backdrop-blur-md bg-opacity-80 z-40">
          {/* 关键修改: 调整内边距，使其在小屏幕上更紧凑 */}
          <div className="w-full px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
              {/* Left Content */}
              <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-blue-900/50 shrink-0">M</div>
                  {/* 调整标题显示策略，在极小屏幕隐藏 */}
                  <h1 className="text-xl font-bold tracking-wide text-gray-200 hidden lg:block truncate">MS Rewards 多账号助手 <span className="text-sm text-gray-500 font-normal ml-1">v3.9.1</span></h1>
                  {config.clockPosition !== 'right' && <ClockComponent />}
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
                              {config.cron?.enabled ? (
                                  <span className="text-emerald-400 font-bold text-base tabular-nums whitespace-nowrap">{nextRunLabel}</span>
                              ) : (
                                  <span className="text-gray-500 text-base whitespace-nowrap">未开启</span>
                              )}
                          </div>
                      </div>
                  )}
                  {visibleWidgets['cron_timer'] && <div className="h-8 w-[1px] bg-gray-800 shrink-0 self-center"></div>}
                  
                  {visibleWidgets['local_backup'] && (
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">本地自动备份</span>
                          <div className="flex gap-2">
                            {config.localBackup?.enabled ? (
                               <span className="text-teal-400 font-bold text-base tabular-nums whitespace-nowrap">{nextLocalBackupLabel}</span>
                            ) : (
                               <span className="text-gray-500 text-base whitespace-nowrap">未开启</span>
                            )}
                          </div>
                      </div>
                  )}
                  {visibleWidgets['local_backup'] && <div className="h-8 w-[1px] bg-gray-800 shrink-0 self-center"></div>}
                  
                  {visibleWidgets['cloud_sync'] && (
                      <>
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">坚果云同步</span>
                          <div className="flex gap-2">
                            {config.nutstore?.autoSync ? (
                               <span className="text-blue-400 font-bold text-base tabular-nums whitespace-nowrap">{nextSyncLabelNutstore}</span>
                            ) : (
                               <span className="text-gray-500 text-base whitespace-nowrap">未开启</span>
                            )}
                          </div>
                      </div>
                      <div className="h-8 w-[1px] bg-gray-800 shrink-0 self-center"></div>
                      <div className="flex flex-col items-center justify-center h-full shrink-0">
                         <span className="text-gray-500 text-xs font-bold uppercase tracking-wider whitespace-nowrap">InfiniCloud</span>
                         <div className="flex gap-2">
                            {config.infinicloud?.autoSync ? (
                               <span className="text-orange-400 font-bold text-base tabular-nums whitespace-nowrap">{nextSyncLabelInfini}</span>
                            ) : (
                               <span className="text-gray-500 text-base whitespace-nowrap">未开启</span>
                            )}
                         </div>
                      </div>
                      </>
                  )}
              </div>

              {/* Right Content */}
              <div className="flex items-center gap-3 shrink-0">
                 {config.clockPosition === 'right' && <ClockComponent />}
                 <button 
                    onClick={() => handleRunAll(false)} 
                    disabled={accounts.length === 0} 
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
              {/* ... Toolbar ... */}
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

                 {/* Task Scheduler - Purple */}
                 <button onClick={() => setShowCronSettings(true)} className={getButtonStyle(config.cron?.enabled, 'task')}>
                     ⏱️ 任务调度 {getIndicator(config.cron?.enabled, 'task')}
                 </button>
                 
                 {/* Cloud Sync - Blue */}
                 <button onClick={() => setShowWebDAV(true)} className={getButtonStyle(config.nutstore?.autoSync || config.infinicloud?.autoSync, 'cloud')}>
                     ☁️ 云同步 {getIndicator(config.nutstore?.autoSync || config.infinicloud?.autoSync, 'cloud')}
                 </button>
                 
                 {/* Local Backup - Orange */}
                 <button onClick={() => setShowDataManage(true)} className={getButtonStyle(config.localBackup?.enabled, 'local')}>
                     💾 本地备份 {getIndicator(config.localBackup?.enabled, 'local')}
                 </button>
                 
                 {/* WxPusher - Green */}
                 <button onClick={() => setShowWxPusher(true)} className={getButtonStyle(config.wxPusher?.enabled, 'push')}>
                     📣 消息推送 {getIndicator(config.wxPusher?.enabled, 'push')}
                 </button>
                 
                 <button onClick={() => setShowProxyGuide(true)} className="px-3 sm:px-4 py-2 bg-gray-800/80 border border-gray-700 hover:border-gray-500 rounded-lg text-gray-300 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap">
                     🔌 代理配置
                 </button>
              </div>

              {/* 账号列表 - 传入 preciseCountdown */}
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
                            onRefresh={refreshSingleAccount} 
                            onRunSingle={(id) => runSingleAccountAutomatically(id, true)}
                            onEditAccount={handleEditAccount}
                            onEditModeChange={(isEditing) => handleEditModeChange(acc.id, isEditing)}
                            onOpenCronGenerator={handleOpenCronForAccount}
                            autoCloseDelay={config.editModeAutoCloseDelay}
                            proxyUrl={config.proxyUrl} 
                            onLog={(msg, type) => addSystemLog(msg, type, `Account:${acc.name}`)}
                            cardFontSizes={config.cardFontSizes}
                            disableAutoClose={showCronGenerator} 
                            preciseCountdown={config.preciseCountdown} // New Prop
                        />
                    </div>
                  ))}
                  {/* ... Add Account Card ... */}
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
                                       <button 
                                           type="button"
                                           onClick={handleAddCopyAuthLink}
                                           className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 text-xs rounded transition-all active:scale-95 font-bold relative"
                                       >
                                           获取授权
                                           {addAuthFeedback && (
                                               <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in duration-200 whitespace-nowrap z-50">
                                                   {addAuthFeedback}
                                               </div>
                                           )}
                                       </button>
                                       <button 
                                           type="button"
                                           onClick={handleAddTokenUpdateClick}
                                           className={`flex-[1.5] py-2 border rounded text-xs transition-all active:scale-95 font-bold relative ${
                                               addTokenStep === 1 
                                               ? 'bg-red-600 hover:bg-red-500 border-red-500 text-white animate-pulse' 
                                               : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white'
                                           }`}
                                       >
                                           {addTokenStep === 1 ? '确认填入凭证' : (newAccountToken ? '更新 Token' : '粘贴 Token')}
                                           {addTokenFeedback && (
                                               <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-700 text-white text-[10px] px-2 py-1 rounded shadow-lg animate-in fade-in zoom-in duration-200 whitespace-nowrap z-50">
                                                   {addTokenFeedback}
                                               </div>
                                           )}
                                       </button>
                                   </div>
                                   
                                   {addTokenError ? (
                                       <div className="text-xs text-red-100 bg-red-600/80 rounded px-2 py-1.5 font-bold mt-2 text-center animate-in fade-in slide-in-from-top-1 shadow-sm">
                                           {addTokenError}
                                       </div>
                                   ) : (
                                       <p className="text-[10px] text-gray-600 mt-2 text-center">
                                           {addTokenStep === 1 ? '⚠️ 确认将剪贴板内容写入？' : '先获取授权复制链接，登录后再点击右侧粘贴'}
                                       </p>
                                   )}
                               </div>

                               <button type="submit" disabled={!newAccountToken} className={`w-full py-3 rounded-lg text-base font-bold shadow-xl shadow-blue-900/20 hover:scale-[1.02] transition-all ${newAccountToken ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                                   + 添加新账号
                               </button>
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
      {/* ... Other modals ... */}
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
      
      <CronGeneratorModal 
        isOpen={showCronGenerator} 
        onClose={() => setShowCronGenerator(false)} 
        onApply={handleApplyCronGen} 
      />
      
      <PasteTrapModal 
        isOpen={showAddPasteTrap} 
        onClose={() => {
            setShowAddPasteTrap(false);
            setAddPasteTrapError('');
        }} 
        onPaste={handleAddTextRead} 
        error={addPasteTrapError}
      />
    </div>
  );
};

export default App;
