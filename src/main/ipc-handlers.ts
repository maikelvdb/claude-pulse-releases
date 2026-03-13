import { BrowserWindow, ipcMain, screen } from 'electron';
import { getActiveSession } from './services/session-watcher';
import { getTodayTokenUsage } from './services/stats-reader';
import { getPlanInfo } from './services/credentials-reader';
import { getCurrentModel, getUsageLimits } from './services/session-parser';
import { recordSnapshot, getActivityHistory } from './services/activity-store';
import { getCachedUpdate } from './services/update-checker';
import { ClaudeUsageState } from '../shared/types';
import { POLL_INTERVAL_SESSION, POLL_INTERVAL_STATS } from '../shared/constants';
import { getSnapEdge, resizeForExpand } from './window-manager';

let cachedState: ClaudeUsageState | null = null;
let helpWindow: BrowserWindow | null = null;

const HELP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Claude Pulse - Help</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #1a1a2e;
  color: #c8c8d8;
  font-size: 13px;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
}
.header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid #333346;
  -webkit-app-region: drag;
  flex-shrink: 0;
  position: relative;
}
.header h1 { color: #E87443; font-size: 18px; margin-bottom: 2px; }
.header .subtitle { color: #888; font-size: 12px; }
.close-btn {
  -webkit-app-region: no-drag;
  position: absolute; top: 16px; right: 20px;
  background: none; border: 1px solid #444; color: #888;
  font-size: 16px; cursor: pointer; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; line-height: 1;
}
.close-btn:hover { color: #E87443; border-color: #E87443; }
.update-banner {
  background: #E8744318;
  border: 1px solid #E8744350;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: none;
}
.update-banner.visible { display: block; }
.update-banner h3 {
  color: #E87443; font-size: 13px; margin-bottom: 4px;
  display: flex; align-items: center; gap: 6px;
}
.update-banner h3 .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #E87443; animation: pulse-dot 2s infinite;
}
.update-banner .version { color: #c8c8d8; font-size: 12px; margin-bottom: 6px; }
.update-banner .notes {
  color: #999; font-size: 11px; line-height: 1.5;
  max-height: 80px; overflow-y: auto; white-space: pre-wrap;
}
.update-banner .notes::-webkit-scrollbar { width: 4px; }
.update-banner .notes::-webkit-scrollbar-thumb { background: #333346; border-radius: 2px; }
.update-banner a {
  color: #E87443; text-decoration: none; font-size: 12px;
  display: inline-block; margin-top: 8px;
}
.update-banner a:hover { text-decoration: underline; }
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 24px;
}
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb { background: #333346; border-radius: 3px; }
.content::-webkit-scrollbar-thumb:hover { background: #444; }
h2 {
  color: #e0e0f0; font-size: 14px; margin-top: 18px; margin-bottom: 8px;
  border-bottom: 1px solid #333346; padding-bottom: 4px;
}
h2:first-child { margin-top: 0; }
p { margin-bottom: 8px; }
.section { margin-bottom: 16px; }
.shortcut-table { width: 100%; border-collapse: collapse; }
.shortcut-table td { padding: 4px 0; vertical-align: top; }
.shortcut-table td:first-child { width: 160px; white-space: nowrap; }
kbd {
  background: #2a2a3e; border: 1px solid #444; border-radius: 3px;
  padding: 1px 6px; font-family: monospace; font-size: 11px; color: #E87443;
}
.ind { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.ind.orange { background: #E87443; }
.ind.green { background: #84a84e; }
.ind.active { background: #4ade80; }
</style>
</head>
<body>

<div class="header">
  <h1>Claude Pulse</h1>
  <p class="subtitle">Real-time Claude Code usage monitor</p>
  <button class="close-btn" onclick="window.close()">&times;</button>
</div>

<div class="content">

<div id="update-banner" class="update-banner">
  <h3><span class="dot"></span> Update Available</h3>
  <div class="version" id="update-version"></div>
  <div class="notes" id="update-notes"></div>
  <a id="update-link" href="#" target="_blank">Download update &rarr;</a>
</div>

<div class="section">
<h2>What is this?</h2>
<p>Claude Pulse is a desktop widget that sits on the edge of your screen and shows
live stats about your Claude Code sessions. It monitors token usage, session
activity, and rate limits in real-time.</p>
</div>

<div class="section">
<h2>Widget sections</h2>
<p><span class="ind active"></span><strong>Session indicator</strong> &mdash;
Shows if a Claude session is active and which model is in use.</p>
<p><strong>Token counter</strong> &mdash; Displays input / output / cache tokens
used in the current session.</p>
<p><strong>Activity chart</strong> &mdash; A live 5-minute line chart of token usage.<br>
<span class="ind orange"></span>Orange = input tokens &nbsp;
<span class="ind green"></span>Green = output tokens</p>
<p><strong>Limit bars</strong> &mdash; Hourly and weekly rate-limit usage.</p>
</div>

<div class="section">
<h2>Keyboard shortcuts</h2>
<table class="shortcut-table">
<tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd></td>
    <td>Toggle widget show / hide (minimize)</td></tr>
<tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Q</kbd></td>
    <td>Quit Claude Pulse (with confirmation)</td></tr>
</table>
</div>

<div class="section">
<h2>Interactions</h2>
<table class="shortcut-table">
<tr><td><strong>Hover</strong></td>
    <td>Widget becomes fully visible</td></tr>
<tr><td><strong>Click chart</strong></td>
    <td>Expand / collapse the detailed activity graph</td></tr>
<tr><td><strong>Drag widget</strong></td>
    <td>Move to any screen edge &mdash; snaps automatically</td></tr>
<tr><td><strong>Click orange bar</strong></td>
    <td>When minimized, click the bar to restore</td></tr>
<tr><td><strong>? button</strong></td>
    <td>Open this help window</td></tr>
</table>
</div>

<div class="section">
<h2>Auto behavior</h2>
<p>The widget shows automatically when a Claude session is detected and hides
after inactivity. Move your mouse to the docked edge to reveal it.</p>
</div>

</div>
<script>
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'update-info' && e.data.hasUpdate) {
      document.getElementById('update-banner').classList.add('visible');
      document.getElementById('update-version').textContent =
        'v' + e.data.currentVersion + ' → v' + e.data.latestVersion;
      document.getElementById('update-notes').textContent = e.data.releaseNotes || 'No release notes.';
      const link = document.getElementById('update-link');
      link.href = e.data.releaseUrl;
      link.onclick = function(ev) { ev.preventDefault(); window.open(e.data.releaseUrl); };
    }
  });
</script>
</body>
</html>`;

function openHelpWindow(): void {
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const w = 420;
  const h = 520;

  helpWindow = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round((sw - w) / 2),
    y: Math.round((sh - h) / 2),
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  helpWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HELP_HTML)}`);

  helpWindow.webContents.on('did-finish-load', () => {
    const update = getCachedUpdate();
    if (update && update.hasUpdate) {
      helpWindow?.webContents.executeJavaScript(
        `window.postMessage(${JSON.stringify({ type: 'update-info', ...update })}, '*')`
      );
    }
  });

  helpWindow.on('closed', () => {
    helpWindow = null;
  });
}

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
    mainWindow.webContents.send('claude:activity-history', getActivityHistory());
  });

  ipcMain.on('widget:request-snap-edge', () => {
    mainWindow.webContents.send('widget:snap-edge', getSnapEdge());
  });

  ipcMain.on('widget:resize', (_event, expanded: boolean) => {
    resizeForExpand(expanded);
  });

  ipcMain.on('widget:open-help', () => {
    openHelpWindow();
  });

  ipcMain.on('widget:quit', () => {
    const { app } = require('electron');
    app.quit();
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
    const newState = buildState();

    // Record activity snapshot regardless of change
    recordSnapshot(
      newState.tokens.inputToday,
      newState.tokens.outputToday,
      newState.session.isActive
    );
    mainWindow.webContents.send('claude:activity-history', getActivityHistory());

    // Only push usage update when token totals or model actually changed
    const changed =
      !cachedState ||
      cachedState.tokens.inputToday !== newState.tokens.inputToday ||
      cachedState.tokens.outputToday !== newState.tokens.outputToday ||
      cachedState.tokens.cacheReadToday !== newState.tokens.cacheReadToday ||
      cachedState.currentModel !== newState.currentModel;

    cachedState = newState;

    if (changed) {
      mainWindow.webContents.send('claude:usage-update', cachedState);
    }
  }, POLL_INTERVAL_STATS);

  // Initial push
  cachedState = buildState();
  mainWindow.webContents.send('claude:usage-update', cachedState);
  mainWindow.webContents.send('claude:activity-history', getActivityHistory());
}
