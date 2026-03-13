import * as pty from '@homebridge/node-pty-prebuilt-multiarch';
import path from 'path';
import os from 'os';

export interface CliStatus {
  sessionPercent: number;   // 0-100
  weeklyPercent: number;    // 0-100
  sessionResetTime: string | null;
  weeklyResetTime: string | null;
  lastUpdated: number;      // timestamp
}

let cachedStatus: CliStatus | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const POLL_INTERVAL = 30_000; // 30s
const SPAWN_TIMEOUT = 15_000; // 15s max for a single poll

function getClaudePath(): string {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), '.local', 'bin', 'claude.exe');
  }
  return 'claude';
}

function parseStatusOutput(output: string): CliStatus | null {
  // Match patterns like "1% used" or "30% used"
  const percentMatches = [...output.matchAll(/(\d+)%\s*used/g)];
  // Match patterns like "Resets 10pm (Europe/Amsterdam)" or "Resets Mar 17, 8am (Europe/Amsterdam)"
  const resetMatches = [...output.matchAll(/Resets\s+(.+)/g)];

  if (percentMatches.length < 2) return null;

  return {
    sessionPercent: parseInt(percentMatches[0][1], 10),
    weeklyPercent: parseInt(percentMatches[1][1], 10),
    sessionResetTime: resetMatches[0]?.[1]?.trim() ?? null,
    weeklyResetTime: resetMatches[1]?.[1]?.trim() ?? null,
    lastUpdated: Date.now(),
  };
}

function pollOnce(): Promise<CliStatus | null> {
  return new Promise((resolve) => {
    let output = '';
    let resolved = false;
    let exitHandled = false;

    const done = (result: CliStatus | null) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const timeout = setTimeout(() => {
      try { term.kill(); } catch {}
      done(null);
    }, SPAWN_TIMEOUT);

    let term: pty.IPty;
    try {
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
      term = pty.spawn(shell, [], {
        name: 'xterm',
        cols: 120,
        rows: 30,
        cwd: os.homedir(),
        env: {
          ...process.env,
          CLAUDECODE: '',
          CLAUDE_CODE_ENTRYPOINT: '',
        },
      });
    } catch (err) {
      clearTimeout(timeout);
      done(null);
      return;
    }

    term.onData((data: string) => {
      output += data;

      // Once we see the second "% used", we have what we need
      const percentCount = (output.match(/\d+%\s*used/g) || []).length;
      if (percentCount >= 2) {
        // Give it a moment to get reset times too
        setTimeout(() => {
          clearTimeout(timeout);
          const parsed = parseStatusOutput(output);
          // Send /exit to cleanly close
          try { term.write('/exit\r'); } catch {}
          setTimeout(() => {
            try { term.kill(); } catch {}
            if (!exitHandled) {
              exitHandled = true;
              done(parsed);
            }
          }, 2000);
        }, 500);
      }
    });

    term.onExit(() => {
      clearTimeout(timeout);
      if (!exitHandled) {
        exitHandled = true;
        const parsed = parseStatusOutput(output);
        done(parsed);
      }
    });

    // Start claude, wait for prompt, then send /status
    setTimeout(() => {
      try {
        term.write(getClaudePath() + '\r');
      } catch {
        clearTimeout(timeout);
        done(null);
        return;
      }
      // Wait for claude to start, then send /status
      setTimeout(() => {
        try {
          term.write('/status\r');
        } catch {}
      }, 3000);
    }, 500);
  });
}

export function getCachedCliStatus(): CliStatus | null {
  return cachedStatus;
}

export function startCliStatusPoller(onUpdate?: (status: CliStatus) => void): void {
  // Initial poll after short delay
  setTimeout(async () => {
    const result = await pollOnce();
    if (result) {
      cachedStatus = result;
      onUpdate?.(result);
    }
  }, 5000);

  pollTimer = setInterval(async () => {
    const result = await pollOnce();
    if (result) {
      cachedStatus = result;
      onUpdate?.(result);
    }
  }, POLL_INTERVAL);
}

export function stopCliStatusPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
