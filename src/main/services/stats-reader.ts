import fs from 'fs';
import { TokenUsage } from '../../shared/types';
import { findTodayJsonlFiles } from './session-file';

interface TokenEntry {
  timestamp: number;
  input: number;
  output: number;
  cacheRead: number;
}

// Cache for incremental reading — keyed per file
const fileCache = new Map<string, {
  fileSize: number;
  inputTotal: number;
  outputTotal: number;
  cacheReadTotal: number;
  entries: TokenEntry[];
}>();

function parseEntriesFromContent(content: string): { input: number; output: number; cacheRead: number; entries: TokenEntry[] } {
  let input = 0;
  let output = 0;
  let cacheRead = 0;
  const entries: TokenEntry[] = [];

  const lines = content.trim().split('\n');
  for (const line of lines) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      const usage = entry.message?.usage ?? entry.usage;
      if (!usage) continue;
      const inp = usage.input_tokens ?? 0;
      const out = usage.output_tokens ?? 0;
      const cr = usage.cache_read_input_tokens ?? 0;
      input += inp;
      output += out;
      cacheRead += cr;

      const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
      if (ts > 0) {
        entries.push({ timestamp: ts, input: inp, output: out, cacheRead: cr });
      }
    } catch {
      continue;
    }
  }

  return { input, output, cacheRead, entries };
}

/**
 * Sum token usage across ALL JSONL session files modified in the last 24 hours.
 * Also calculates sliding-window hourly usage from entry timestamps.
 */
export function getTodayTokenUsage(): TokenUsage {
  const empty: TokenUsage = { inputToday: 0, outputToday: 0, cacheReadToday: 0, inputLastHour: 0, outputLastHour: 0 };

  try {
    const todayFiles = findTodayJsonlFiles();
    if (todayFiles.length === 0) return empty;

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheRead = 0;
    const allEntries: TokenEntry[] = [];

    const activeFiles = new Set(todayFiles);

    for (const filePath of todayFiles) {
      try {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const cached = fileCache.get(filePath);

        if (cached && fileSize >= cached.fileSize) {
          if (fileSize === cached.fileSize) {
            totalInput += cached.inputTotal;
            totalOutput += cached.outputTotal;
            totalCacheRead += cached.cacheReadTotal;
            allEntries.push(...cached.entries);
            continue;
          }

          // File grew — read only new bytes
          const fd = fs.openSync(filePath, 'r');
          const newBytes = Buffer.alloc(fileSize - cached.fileSize);
          fs.readSync(fd, newBytes, 0, newBytes.length, cached.fileSize);
          fs.closeSync(fd);

          const parsed = parseEntriesFromContent(newBytes.toString('utf-8'));
          const input = cached.inputTotal + parsed.input;
          const output = cached.outputTotal + parsed.output;
          const cacheRead = cached.cacheReadTotal + parsed.cacheRead;
          const entries = [...cached.entries, ...parsed.entries];

          fileCache.set(filePath, { fileSize, inputTotal: input, outputTotal: output, cacheReadTotal: cacheRead, entries });
          totalInput += input;
          totalOutput += output;
          totalCacheRead += cacheRead;
          allEntries.push(...entries);
          continue;
        }

        // New file or file was truncated — full parse
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseEntriesFromContent(content);

        fileCache.set(filePath, { fileSize, inputTotal: parsed.input, outputTotal: parsed.output, cacheReadTotal: parsed.cacheRead, entries: parsed.entries });
        totalInput += parsed.input;
        totalOutput += parsed.output;
        totalCacheRead += parsed.cacheRead;
        allEntries.push(...parsed.entries);
      } catch {
        continue;
      }
    }

    // Clean up stale cache entries
    for (const key of fileCache.keys()) {
      if (!activeFiles.has(key)) {
        fileCache.delete(key);
      }
    }

    // Calculate sliding 5-hour window usage (matches claude.ai "Current session" window)
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
    let inputLastHour = 0;
    let outputLastHour = 0;
    for (const e of allEntries) {
      if (e.timestamp >= fiveHoursAgo) {
        inputLastHour += e.input;
        outputLastHour += e.output;
      }
    }

    return { inputToday: totalInput, outputToday: totalOutput, cacheReadToday: totalCacheRead, inputLastHour, outputLastHour };
  } catch {
    return empty;
  }
}
