import * as pty from 'node-pty';
import path from 'path';
import os from 'os';
import { log } from './logger';

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
const SPAWN_TIMEOUT = 30_000; // 30s max for a single poll

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

    log('cli-poller', 'info', 'Polling CLI for status...');

    const timeout = setTimeout(() => {
      try { term.kill(); } catch {}
      const truncated = output.length > 200 ? output.slice(-200) : output;
      log('cli-poller', 'warn', 'Poll timed out after ' + (SPAWN_TIMEOUT / 1000) + 's — last output: ' + truncated.replace(/[\r\n]+/g, ' ').trim());
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
      log('cli-poller', 'error', 'Failed to spawn PTY: ' + (err instanceof Error ? err.message : String(err)));
      done(null);
      return;
    }

    let trustHandled = false;
    let statusSent = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function stripAnsi(s: string): string {
      return s.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b[>\?][0-9;]*[a-zA-Z]/g, '');
    }

    // When output stops for 1.5s after launch, CLI is ready for /status
    function resetIdleTimer() {
      if (statusSent) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (!statusSent) {
          statusSent = true;
          log('cli-poller', 'info', 'CLI appears ready, sending /status');
          try { term.write('/status\r'); } catch {}
        }
      }, 1500);
    }

    term.onData((data: string) => {
      output += data;

      // Reset idle timer on each chunk of output
      resetIdleTimer();

      // Handle "Do you trust this folder?" prompt — press Enter to confirm "Yes"
      if (!trustHandled && /trust.{0,5}this.{0,5}folder/i.test(stripAnsi(output))) {
        trustHandled = true;
        log('cli-poller', 'info', 'Trust prompt detected, confirming...');
        setTimeout(() => { try { term.write('\r'); } catch {} }, 500);
        setTimeout(() => { try { term.write('\r'); } catch {} }, 1500);
      }

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

    // Start claude
    setTimeout(() => {
      try {
        term.write(getClaudePath() + '\r');
      } catch {
        clearTimeout(timeout);
        done(null);
        return;
      }
      resetIdleTimer();
    }, 500);
  });
}

export function getCachedCliStatus(): CliStatus | null {
  return cachedStatus;
}

export function startCliStatusPoller(onUpdate?: (status: CliStatus) => void): void {
  log('cli-poller', 'info', 'Starting CLI status poller (interval: ' + (POLL_INTERVAL / 1000) + 's)');

  // Initial poll after short delay
  setTimeout(async () => {
    const result = await pollOnce();
    if (result) {
      cachedStatus = result;
      log('cli-poller', 'info', 'Status: session ' + result.sessionPercent + '% | weekly ' + result.weeklyPercent + '%');
      onUpdate?.(result);
    }
  }, 5000);

  pollTimer = setInterval(async () => {
    const result = await pollOnce();
    if (result) {
      cachedStatus = result;
      log('cli-poller', 'info', 'Status: session ' + result.sessionPercent + '% | weekly ' + result.weeklyPercent + '%');
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
