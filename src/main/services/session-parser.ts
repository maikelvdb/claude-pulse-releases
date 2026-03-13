import fs from 'fs';
import { UsageLimits } from '../../shared/types';
import { findLatestJsonlFile } from './session-file';

// Estimated 5-hour session / 7-day token limits per tier
// These are approximations — exact limits are server-side and include all products
const TIER_LIMITS: Record<string, { session: number; weekly: number }> = {
  'default_claude_max_5x': { session: 1_500_000, weekly: 45_000_000 },
  'default_claude_max_20x': { session: 6_000_000, weekly: 180_000_000 },
  'default_claude_pro': { session: 300_000, weekly: 9_000_000 },
  default: { session: 500_000, weekly: 15_000_000 },
};

export function getCurrentModel(): string | null {
  try {
    const latestFile = findLatestJsonlFile();
    if (!latestFile) return null;

    // Read last few lines to find model info
    const content = fs.readFileSync(latestFile, 'utf-8');
    const lines = content.trim().split('\n').reverse();

    for (const line of lines.slice(0, 50)) {
      try {
        const entry = JSON.parse(line);
        if (entry.message?.role === 'assistant' && entry.message?.model) {
          return formatModelName(entry.message.model);
        }
        if (entry.model) {
          return formatModelName(entry.model);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Projects dir missing or unreadable
  }
  return null;
}

function formatModelName(modelId: string): string {
  // "claude-opus-4-6" -> "Opus 4.6"
  // "claude-sonnet-4-6" -> "Sonnet 4.6"
  const match = modelId.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${name} ${match[2]}.${match[3]}`;
  }
  return modelId;
}

export function getUsageLimits(
  rateLimitTier: string,
  inputLastSession: number,
  outputLastSession: number,
  inputToday: number,
  outputToday: number
): UsageLimits {
  const tierLimits = TIER_LIMITS[rateLimitTier] ?? TIER_LIMITS.default;

  // Session: 5-hour sliding window (matches claude.ai "Current session")
  const sessionTokens = inputLastSession + outputLastSession;

  // Weekly: use today's total as approximation (we don't have full week data)
  const dailyTokens = inputToday + outputToday;

  return {
    hourlyUsed: Math.min(sessionTokens / tierLimits.session, 1),
    hourlyEstimate: tierLimits.session,
    weeklyUsed: Math.min(dailyTokens / tierLimits.weekly, 1),
    weeklyEstimate: tierLimits.weekly,
  };
}
