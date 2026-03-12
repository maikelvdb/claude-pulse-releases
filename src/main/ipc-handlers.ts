import { BrowserWindow, ipcMain } from 'electron';
import { getActiveSession } from './services/session-watcher';
import { getTodayTokenUsage } from './services/stats-reader';
import { getPlanInfo } from './services/credentials-reader';
import { getCurrentModel, getUsageLimits } from './services/session-parser';
import { ClaudeUsageState } from '../shared/types';
import { POLL_INTERVAL_SESSION, POLL_INTERVAL_STATS } from '../shared/constants';

let cachedState: ClaudeUsageState | null = null;

function buildState(): ClaudeUsageState {
  const session = getActiveSession();
  const tokens = getTodayTokenUsage();
  const plan = getPlanInfo();
  const currentModel = getCurrentModel();
  const limits = getUsageLimits(
    plan.rateLimitTier,
    tokens.inputToday,
    tokens.outputToday
  );

  return { session, currentModel, tokens, limits, plan };
}

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // Respond to manual requests
  ipcMain.on('claude:request-update', () => {
    cachedState = buildState();
    mainWindow.webContents.send('claude:usage-update', cachedState);
  });

  // Fast poll for session changes (2s)
  setInterval(() => {
    const newSession = getActiveSession();
    const sessionChanged = cachedState?.session.isActive !== newSession.isActive;

    if (sessionChanged) {
      cachedState = buildState();
      mainWindow.webContents.send('claude:usage-update', cachedState);
    }
  }, POLL_INTERVAL_SESSION);

  // Slower poll for full stats (10s)
  setInterval(() => {
    cachedState = buildState();
    mainWindow.webContents.send('claude:usage-update', cachedState);
  }, POLL_INTERVAL_STATS);

  // Initial push
  cachedState = buildState();
  mainWindow.webContents.send('claude:usage-update', cachedState);
}
