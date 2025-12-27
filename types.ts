
export interface Account {
  id: string;
  name: string; // 备注名
  refreshToken: string; // 核心凭证
  accessToken?: string; // 运行时临时凭证
  tokenExpiresAt?: number; // AccessToken 过期时间戳
  status: 'idle' | 'running' | 'refreshing' | 'success' | 'error' | 'waiting' | 'risk' | 'disabled'; // Added refreshing
  logs: LogEntry[];
  lastRunTime?: number;
  totalPoints: number; // 账号总积分
  stats: AccountStats;
  pointHistory: PointHistoryItem[]; // 积分历史记录
  
  // 新增字段
  enabled?: boolean; // 是否启用账号 (全局开关)
  cronEnabled?: boolean; // 是否启用独立定时器 (New)
  cronExpression?: string; // 独立定时任务表达式
  ignoreRisk?: boolean; // 是否忽略风控警告强制执行 (New)
  webCheckInStreak?: number; // Web 端签到连胜天数 (本地记录)
}

export interface RedeemGoal {
  title: string;
  price: number;
  imageUrl?: string;
}

export interface AccountStats {
  readProgress: number;
  readMax: number;
  pcSearchProgress: number;     // PC 搜索进度
  pcSearchMax: number;          // PC 搜索上限
  mobileSearchProgress: number; // 移动端搜索进度
  mobileSearchMax: number;      // 移动端搜索上限
  checkInProgress?: number;     // 签到/打卡进度
  checkInMax?: number;          // 签到/打卡上限
  redeemGoal?: RedeemGoal;      // 兑换目标
  
  // 新增：Web Dashboard 聚合状态
  dailySetProgress?: number;    // 每日活动完成数 (通常是 0-3)
  dailySetMax?: number;         // 每日活动总数
  morePromosProgress?: number;  // 更多活动完成数
  morePromosMax?: number;       // 更多活动总数
  
  // 新增：每日活动 (Daily Activities / Global Offers)
  dailyActivitiesProgress?: number;
  dailyActivitiesMax?: number;
}

export interface PointHistoryItem {
  date: string;
  points: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'error' | 'warning' | 'risk';
  message: string;
}

// 全局系统日志
export interface SystemLog {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'error' | 'warning' | 'risk';
  source: 'System' | 'WebDAV' | 'Scheduler' | 'Backup' | string;
  message: string;
}

export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
  backupPath?: string;        // 自定义备份目录名称 (默认为 MS_Rewards_Backups)
  autoSync?: boolean;         // 是否开启自动同步
  cronExpression?: string;    // 自动同步的 Cron 表达式
  lastSyncTime?: number;      // 上次同步时间
}

export interface CronConfig {
  enabled: boolean;
  cronExpression: string; 
  lastRunTime?: number;   
}

// WxPusher 新版配置：支持多目标分发
export interface WxPusherTarget {
  id: string;
  name: string;       // 目标备注 (如: "给张三")
  uids: string;       // 接收人 UID (支持多个逗号分隔)
  filterAccounts: string[]; // 订阅的账号ID列表，为空则全选
  enabled?: boolean;  // 是否启用该目标 (New)
}

export interface WxPusherConfig {
  enabled: boolean;
  appToken: string;
  targets: WxPusherTarget[]; // 多路分发列表
}

// 本地自动备份配置
export interface LocalBackupConfig {
  enabled: boolean;
  path: string;       // 备份路径，默认 'backups'
  cronExpression: string;
  maxFiles: number;   // 最大保留文件数，默认 30
  lastRunTime?: number;
}

export interface AppConfig {
  proxyUrl: string;
  delayBetweenAccounts: number;
  runSign: boolean;
  runRead: boolean;
  minDelay: number;
  maxDelay: number;
  
  // 独立的多云配置
  nutstore?: WebDAVConfig;    // 坚果云
  infinicloud?: WebDAVConfig; // InfiniCloud
  
  // 本地自动备份配置
  localBackup?: LocalBackupConfig;

  cron?: CronConfig; 
  gridCols?: number; // 0=Auto, 1-5=Fixed
  layoutGap?: number; // 卡片间距 (Tailwind scale: 4, 6, 8...)
  containerPadding?: number; // 容器内边距 (Tailwind scale: 4, 8, 12...)
  
  wxPusher?: WxPusherConfig; // 推送配置
  
  // 兼容旧配置字段 (用于迁移)
  localBackupPath?: string; 
  
  autoIdleDelay?: number; // 任务完成后自动转为闲置状态的延迟 (分钟)，0 为不自动
  
  // 监控面板配置
  monitorLogDays?: number; // 监控日志显示天数，默认 1 (当天)

  // UI/UX 配置 (v3.4 新增)
  clockPosition?: 'left' | 'right'; // 毫秒时钟位置
  editModeAutoCloseDelay?: number; // 配置模式无操作自动关闭时间 (秒)，0 为不自动关闭
  showButtonHighlight?: boolean; // 是否启用功能按钮的高亮背景 (Task/Push)
  forceGreenIndicators?: boolean; // 是否强制统一指示灯颜色为绿色 (New)
  preciseCountdown?: boolean; // 是否启用精确倒计时显示 (v3.8)
  
  // 策略配置 (v3.9)
  allowSinglePush?: boolean; // 是否允许单独运行时的即时推送
  skipDailyCompleted?: boolean; // 是否在一键启动时跳过今日已完成的账号 (v3.9.1)
  
  // 字体配置 (v3.7)
  cardFontSizes?: {
      totalPoints: 'text-2xl' | 'text-3xl' | 'text-4xl' | 'text-5xl';
      dailyChange: 'text-lg' | 'text-xl' | 'text-2xl' | 'text-3xl';
  };
}

export const DEFAULT_UA_MOBILE = "Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36 EdgA/112.0.1722.59";
export const DEFAULT_UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36 Edg/112.0.1722.58";
