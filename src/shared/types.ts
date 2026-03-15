export interface SessionInfo {
  isActive: boolean;
  pid: number | null;
  workspace: string | null;
  ideName: string | null;
  source: 'ide' | 'cli' | null;
  sessionCount: number;
}

export interface TokenUsage {
  inputToday: number;
  outputToday: number;
  cacheReadToday: number;
  inputLastHour: number;
  outputLastHour: number;
}

export interface UsageLimits {
  hourlyUsed: number;       // 0-1 ratio
  hourlyEstimate: number;   // estimated max tokens/hour
  weeklyUsed: number;       // 0-1 ratio
  weeklyEstimate: number;   // estimated max tokens/week
}

export interface PlanInfo {
  subscriptionType: string;
  rateLimitTier: string;
}

export interface CliStatus {
  sessionPercent: number;
  weeklyPercent: number;
  sessionResetTime: string | null;
  weeklyResetTime: string | null;
  lastUpdated: number;
}

export interface ClaudeUsageState {
  session: SessionInfo;
  currentModel: string | null;
  tokens: TokenUsage;
  limits: UsageLimits;
  plan: PlanInfo;
  sessionStartedAt: number | null;
  cliStatus: CliStatus | null;
}

export interface IpcChannels {
  'claude:usage-update': ClaudeUsageState;
  'claude:request-update': void;
  'claude:activity-history': ActivitySnapshot[];
  'widget:resize': boolean;
  'widget:visibility': boolean;
  'widget:snap-edge': SnapEdge;
  'widget:request-snap-edge': void;
}

export type SnapEdge = 'top' | 'bottom' | 'left' | 'right';

export type ThemeName = 'dark' | 'light' | 'sunset';

export interface PulseConfig {
  snapEdge: SnapEdge;
  userOffset?: number | null;
  theme?: ThemeName;
  opacity?: number;       // 0.4 - 1.0
  hoverOpacity?: number;  // 0.4 - 1.0
  positionLocked?: boolean;
  autoStart?: boolean;
  soundMuted?: boolean;
}

export interface ActivitySnapshot {
  t: number;        // timestamp (ms)
  input: number;    // cumulative input tokens today
  output: number;   // cumulative output tokens today
  active: boolean;  // session active at this moment
}

export interface DailyRollup {
  input: number;
  output: number;
}

export interface DailyRollups {
  [date: string]: DailyRollup;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: number | null;  // timestamp or null if locked
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  latestDownloadUrl: string;
  latestDownloadSize: number;
  releaseNotes: string;
  releaseUrl: string;
}

export interface RcSession {
  sessionId: string;
  url: string;
  slug: string;
  cwd: string;
  startedAt: number;
}
