import fs from 'fs';
import { STATS_CACHE_FILE } from '../../shared/constants';
import { TokenUsage } from '../../shared/types';

interface StatsCache {
  dailyModelTokens?: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  }>;
}

export function getTodayTokenUsage(): TokenUsage {
  const empty: TokenUsage = { inputToday: 0, outputToday: 0, cacheReadToday: 0 };

  try {
    if (!fs.existsSync(STATS_CACHE_FILE)) return empty;

    const data: StatsCache = JSON.parse(fs.readFileSync(STATS_CACHE_FILE, 'utf-8'));

    // Sum all model usage (stats-cache tracks cumulative)
    let input = 0, output = 0, cacheRead = 0;

    if (data.modelUsage) {
      for (const model of Object.values(data.modelUsage)) {
        input += model.inputTokens ?? 0;
        output += model.outputTokens ?? 0;
        cacheRead += model.cacheReadInputTokens ?? 0;
      }
    }

    return { inputToday: input, outputToday: output, cacheReadToday: cacheRead };
  } catch {
    return empty;
  }
}
