import fs from 'fs';
import { TokenUsage } from '../../shared/types';
import { findLatestJsonlFile } from './session-file';

// Cache for incremental reading
let cache: {
  filePath: string;
  fileSize: number;
  inputTotal: number;
  outputTotal: number;
  cacheReadTotal: number;
} | null = null;

/**
 * Find the most recently modified JSONL session file and sum all
 * usage.input_tokens / usage.output_tokens from assistant messages.
 * This gives live cumulative token counts that update as the session progresses.
 *
 * Uses incremental reading: if the same file has grown since last poll,
 * only the new bytes are read and parsed.
 */
export function getTodayTokenUsage(): TokenUsage {
  const empty: TokenUsage = { inputToday: 0, outputToday: 0, cacheReadToday: 0 };

  try {
    const latestFile = findLatestJsonlFile();
    if (!latestFile) return empty;

    // Only count if the file was modified recently (within 24h)
    const stat = fs.statSync(latestFile);
    if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) return empty;

    const fileSize = stat.size;

    // If same file and it has grown, read only the new bytes
    if (cache && cache.filePath === latestFile && fileSize >= cache.fileSize) {
      if (fileSize === cache.fileSize) {
        // No change
        return {
          inputToday: cache.inputTotal,
          outputToday: cache.outputTotal,
          cacheReadToday: cache.cacheReadTotal,
        };
      }

      // Read only new bytes from the cached offset
      const fd = fs.openSync(latestFile, 'r');
      const newBytes = Buffer.alloc(fileSize - cache.fileSize);
      fs.readSync(fd, newBytes, 0, newBytes.length, cache.fileSize);
      fs.closeSync(fd);

      const newContent = newBytes.toString('utf-8');
      const lines = newContent.trim().split('\n');

      let input = cache.inputTotal;
      let output = cache.outputTotal;
      let cacheRead = cache.cacheReadTotal;

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

      cache = { filePath: latestFile, fileSize, inputTotal: input, outputTotal: output, cacheReadTotal: cacheRead };
      return { inputToday: input, outputToday: output, cacheReadToday: cacheRead };
    }

    // Different file or first read — full parse
    const content = fs.readFileSync(latestFile, 'utf-8');
    const lines = content.trim().split('\n');

    let input = 0;
    let output = 0;
    let cacheRead = 0;

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

    cache = { filePath: latestFile, fileSize, inputTotal: input, outputTotal: output, cacheReadTotal: cacheRead };
    return { inputToday: input, outputToday: output, cacheReadToday: cacheRead };
  } catch {
    return empty;
  }
}
