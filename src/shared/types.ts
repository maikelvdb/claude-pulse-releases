export interface SessionInfo {
  isActive: boolean;
  pid: number | null;
  workspace: string | null;
  ideName: string | null;
  source: 'ide' | 'cli' | null;
}

export interface TokenUsage {
  inputToday: number;
  outputToday: number;
  cacheReadToday: number;
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

export interface ClaudeUsageState {
  session: SessionInfo;
  currentModel: string | null;
  tokens: TokenUsage;
  limits: UsageLimits;
  plan: PlanInfo;
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

export interface PulseConfig {
  snapEdge: SnapEdge;
}

export interface ActivitySnapshot {
  t: number;        // timestamp (ms)
  input: number;    // cumulative input tokens today
  output: number;   // cumulative output tokens today
  active: boolean;  // session active at this moment
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseNotes: string;
  releaseUrl: string;
}
