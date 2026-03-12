export interface SessionInfo {
  isActive: boolean;
  pid: number | null;
  workspace: string | null;
  ideName: string | null;
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
}
