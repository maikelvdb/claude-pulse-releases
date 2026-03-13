import fs from 'fs';
import { TokenUsage } from '../../shared/types';
import { findTodayJsonlFiles } from './session-file';

// Cache for incremental reading — keyed per file
const fileCache = new Map<string, {
  fileSize: number;
  inputTotal: number;
  outputTotal: number;
  cacheReadTotal: number;
}>();

function parseTokensFromContent(content: string): { input: number; output: number; cacheRead: number } {
  let input = 0;
  let output = 0;
  let cacheRead = 0;

  const lines = content.trim().split('\n');
  for (const line of lines) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      const usage = entry.message?.usage ?? entry.usage;
      if (!usage) continue;
      input += usage.input_tokens ?? 0;
      output += usage.output_tokens ?? 0;
      cacheRead += usage.cache_read_input_tokens ?? 0;
    } catch {
      continue;
    }
  }

  return { input, output, cacheRead };
}

/**
 * Sum token usage across ALL JSONL session files modified in the last 24 hours.
 * Uses per-file incremental caching so only new bytes are parsed on each poll.
 */
export function getTodayTokenUsage(): TokenUsage {
  const empty: TokenUsage = { inputToday: 0, outputToday: 0, cacheReadToday: 0 };

  try {
    const todayFiles = findTodayJsonlFiles();
    if (todayFiles.length === 0) return empty;

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;

    // Track which files are still active to clean up stale cache entries
    const activeFiles = new Set(todayFiles);

    for (const filePath of todayFiles) {
      try {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const cached = fileCache.get(filePath);

        if (cached && fileSize >= cached.fileSize) {
          if (fileSize === cached.fileSize) {
            // No change — use cached totals
            totalInput += cached.inputTotal;
            totalOutput += cached.outputTotal;
            totalCacheRead += cached.cacheReadTotal;
            continue;
          }

          // File grew — read only new bytes
          const fd = fs.openSync(filePath, 'r');
          const newBytes = Buffer.alloc(fileSize - cached.fileSize);
          fs.readSync(fd, newBytes, 0, newBytes.length, cached.fileSize);
          fs.closeSync(fd);

          const parsed = parseTokensFromContent(newBytes.toString('utf-8'));
          const input = cached.inputTotal + parsed.input;
          const output = cached.outputTotal + parsed.output;
          const cacheRead = cached.cacheReadTotal + parsed.cacheRead;

          fileCache.set(filePath, { fileSize, inputTotal: input, outputTotal: output, cacheReadTotal: cacheRead });
          totalInput += input;
          totalOutput += output;
          totalCacheRead += cacheRead;
          continue;
        }

        // New file or file was truncated — full parse
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseTokensFromContent(content);

        fileCache.set(filePath, { fileSize, inputTotal: parsed.input, outputTotal: parsed.output, cacheReadTotal: parsed.cacheRead });
        totalInput += parsed.input;
        totalOutput += parsed.output;
        totalCacheRead += parsed.cacheRead;
      } catch {
        continue;
      }
    }

    // Clean up cache entries for files no longer in today's list
    for (const key of fileCache.keys()) {
      if (!activeFiles.has(key)) {
        fileCache.delete(key);
      }
    }

    return { inputToday: totalInput, outputToday: totalOutput, cacheReadToday: totalCacheRead };
  } catch {
    return empty;
  }
}
