import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR } from '../../shared/constants';

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Scan all JSONL files modified in the last 24h and compute token usage per model.
 */
export function getModelBreakdown(): ModelUsage[] {
  const models = new Map<string, { input: number; output: number }>();

  try {
    if (!fs.existsSync(PROJECTS_DIR)) return [];

    const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const dir of projectDirs) {
      const dirPath = path.join(PROJECTS_DIR, dir.name);
      let files: string[];
      try {
        files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl') && !f.includes('subagent'));
      } catch { continue; }

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const stat = fs.statSync(filePath);
          if (Date.now() - stat.mtimeMs > 24 * 60 * 60 * 1000) continue;

          const content = fs.readFileSync(filePath, 'utf-8');
          for (const line of content.trim().split('\n')) {
            if (!line) continue;
            try {
              const entry = JSON.parse(line);
              const msg = entry.message;
              if (!msg || msg.role !== 'assistant') continue;
              const usage = msg.usage;
              if (!usage) continue;

              const model = formatModel(msg.model || 'unknown');
              const existing = models.get(model) || { input: 0, output: 0 };
              existing.input += usage.input_tokens ?? 0;
              existing.output += usage.output_tokens ?? 0;
              models.set(model, existing);
            } catch { continue; }
          }
        } catch { continue; }
      }
    }
  } catch { /* ignore */ }

  const result: ModelUsage[] = [];
  for (const [model, usage] of models) {
    if (usage.input + usage.output > 0) {
      result.push({ model, inputTokens: usage.input, outputTokens: usage.output });
    }
  }
  result.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens));
  return result;
}

function formatModel(modelId: string): string {
  const match = modelId.match(/claude-(\w+)-(\d+)-(\d+)/);
  if (match) {
    const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
    return `${name} ${match[2]}.${match[3]}`;
  }
  return modelId;
}
