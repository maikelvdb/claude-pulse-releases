import fs from 'fs';
import { UsageLimits } from '../../shared/types';
import { findLatestJsonlFile } from './session-file';

// Default hourly/weekly token estimates per tier
const TIER_LIMITS: Record<string, { hourly: number; weekly: number }> = {
  'default_claude_max_5x': { hourly: 500_000, weekly: 15_000_000 },
  'default_claude_pro': { hourly: 200_000, weekly: 5_000_000 },
  default: { hourly: 300_000, weekly: 10_000_000 },
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
  inputTokens: number,
  outputTokens: number
): UsageLimits {
  const tierLimits = TIER_LIMITS[rateLimitTier] ?? TIER_LIMITS.default;
  const totalTokens = inputTokens + outputTokens;

  // These are rough estimates — exact limits are server-side
  return {
    hourlyUsed: Math.min(totalTokens / tierLimits.hourly, 1),
    hourlyEstimate: tierLimits.hourly,
    weeklyUsed: Math.min(totalTokens / tierLimits.weekly, 1),
    weeklyEstimate: tierLimits.weekly,
  };
}
