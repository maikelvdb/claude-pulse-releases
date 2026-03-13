import { BrowserWindow, ipcMain, screen } from 'electron';
import { getActiveSession } from './services/session-watcher';
import { getTodayTokenUsage } from './services/stats-reader';
import { getPlanInfo } from './services/credentials-reader';
import { getCurrentModel, getUsageLimits } from './services/session-parser';
import { recordSnapshot, getActivityHistory } from './services/activity-store';
import { getCachedUpdate, downloadUpdate, runInstaller } from './services/update-checker';
import { checkRateLimits } from './services/rate-limit-notifier';
import { getProjectBreakdown } from './services/project-scanner';
import { ClaudeUsageState, ThemeName } from '../shared/types';
import { POLL_INTERVAL_SESSION, POLL_INTERVAL_STATS } from '../shared/constants';
import { getSnapEdge, resizeForExpand } from './window-manager';
import { saveConfig, getConfig } from './services/config-store';

let cachedState: ClaudeUsageState | null = null;
let helpWindow: BrowserWindow | null = null;

const HELP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Claude Pulse - Help</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: 100%; overflow: hidden; user-select: none; -webkit-user-select: none; }
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
  padding: 20px 24px 0;
  -webkit-app-region: drag;
  flex-shrink: 0;
  position: relative;
}
.header h1 { color: #E87443; font-size: 18px; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; }
.header .version-badge { font-size: 10px; color: #888; background: #2a2a3e; border: 1px solid #444; border-radius: 10px; padding: 1px 8px; font-weight: normal; }
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

/* Tabs */
.tabs {
  display: flex;
  gap: 0;
  padding: 16px 24px 0;
  flex-shrink: 0;
  border-bottom: 1px solid #333346;
  -webkit-app-region: no-drag;
}
.tab {
  padding: 8px 16px;
  font-size: 12px;
  color: #888;
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.2s, border-color 0.2s;
  position: relative;
}
.tab:hover { color: #c8c8d8; }
.tab.active {
  color: #E87443;
  border-bottom-color: #E87443;
}
.tab .tab-dot {
  position: absolute;
  top: 6px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #E87443;
  animation: pulse-dot 2s infinite;
  display: none;
}
.tab .tab-dot.visible { display: block; }

/* Tab content */
.tab-panels {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.tab-panel {
  display: none;
  position: absolute;
  inset: 0;
  overflow-y: auto;
  padding: 16px 24px 24px;
}
.tab-panel.active { display: block; }
.tab-panel::-webkit-scrollbar { width: 6px; }
.tab-panel::-webkit-scrollbar-track { background: transparent; }
.tab-panel::-webkit-scrollbar-thumb { background: #333346; border-radius: 3px; }
.tab-panel::-webkit-scrollbar-thumb:hover { background: #444; }

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

/* Release notes tab */
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
.release-notes-content {
  color: #999; font-size: 12px; line-height: 1.6; white-space: pre-wrap;
}
.release-notes-content a { color: #E87443; text-decoration: none; }
.release-notes-content a:hover { text-decoration: underline; }
.update-link {
  color: #E87443; text-decoration: none; font-size: 12px;
  display: inline-block; margin-top: 8px;
}
.update-link:hover { text-decoration: underline; }
.current-version {
  color: #666; font-size: 11px; margin-top: 12px;
}

.project-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #333346; }
.project-row:last-child { border-bottom: none; }
.project-name { flex: 1; font-size: 12px; color: #c8c8d8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.project-tokens { font-size: 11px; color: #888; white-space: nowrap; }
.project-bar-wrap { width: 60px; height: 6px; background: #2a2a3e; border-radius: 3px; overflow: hidden; flex-shrink: 0; }
.project-bar { height: 100%; background: #E87443; border-radius: 3px; transition: width 0.3s; }
.no-projects { color: #666; font-size: 12px; font-style: italic; }

.theme-picker { display: flex; gap: 8px; }
.theme-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 6px;
  border: 1px solid #444; background: #2a2a3e; color: #c8c8d8;
  font-size: 12px; cursor: pointer; transition: border-color 0.2s;
}
.theme-btn:hover { border-color: #E87443; }
.theme-btn.active { border-color: #E87443; background: #E8744320; }
.theme-swatch {
  display: inline-block; width: 14px; height: 14px;
  border-radius: 50%; border: 2px solid;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
</head>
<body>

<div class="header">
  <h1>Claude Pulse <span class="version-badge" id="header-version"></span></h1>
  <p class="subtitle">Real-time Claude Code usage monitor</p>
  <button class="close-btn" onclick="window.close()">&times;</button>
</div>

<div class="tabs">
  <button class="tab active" data-tab="general">General</button>
  <button class="tab" data-tab="shortcuts">Shortcuts</button>
  <button class="tab" data-tab="projects">Projects</button>
  <button class="tab" data-tab="releases">
    Release Notes
    <span class="tab-dot" id="releases-dot"></span>
  </button>
</div>

<div class="tab-panels">

  <!-- General tab -->
  <div class="tab-panel active" id="tab-general">
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
      <h2>Auto behavior</h2>
      <p>The widget shows automatically when a Claude session is detected and hides
      after inactivity. Move your mouse to the docked edge to reveal it.</p>
    </div>

    <div class="section">
      <h2>Theme</h2>
      <div class="theme-picker">
        <button class="theme-btn" data-theme="dark" title="Dark">
          <span class="theme-swatch" style="background:#1e1e2e;border-color:#333346"></span> Dark
        </button>
        <button class="theme-btn" data-theme="light" title="Light">
          <span class="theme-swatch" style="background:#f5f5f7;border-color:#c8c8d8"></span> Light
        </button>
        <button class="theme-btn" data-theme="sunset" title="Sunset">
          <span class="theme-swatch" style="background:#2d1b2e;border-color:#4d3b4e"></span> Sunset
        </button>
      </div>
    </div>
  </div>

  <!-- Shortcuts tab -->
  <div class="tab-panel" id="tab-shortcuts">
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
      <h2>Mouse interactions</h2>
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
  </div>

  <!-- Projects tab -->
  <div class="tab-panel" id="tab-projects">
    <div class="section">
      <h2>Token Usage by Project (24h)</h2>
      <div id="project-list"><p style="color:#666">Loading...</p></div>
    </div>
  </div>

  <!-- Release Notes tab -->
  <div class="tab-panel" id="tab-releases">
    <div id="update-banner" class="update-banner">
      <h3><span class="dot"></span> Update Available</h3>
      <div class="version" id="update-version"></div>
      <a class="update-link" id="update-link" href="#" target="_blank">Download update &rarr;</a>
    </div>

    <div class="section">
      <h2>Latest Release</h2>
      <div class="release-notes-content" id="release-notes">No release information available.</div>
    </div>

    <p class="current-version" id="current-version"></p>
  </div>

</div>

<script>
  // Tab switching
  document.querySelectorAll('.tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });

  // Format token count
  function fmtTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  // Theme switching — communicate via page title
  document.querySelectorAll('.theme-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var theme = btn.dataset.theme;
      document.querySelectorAll('.theme-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.title = 'theme:' + theme;
    });
  });

  // Update info
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'update-info') {
      document.getElementById('header-version').textContent = 'v' + e.data.currentVersion;
      document.getElementById('current-version').textContent = 'Current version: v' + e.data.currentVersion;

      if (e.data.releaseNotes) {
        document.getElementById('release-notes').textContent = e.data.releaseNotes;
      }

      if (e.data.hasUpdate) {
        document.getElementById('update-banner').classList.add('visible');
        document.getElementById('update-version').textContent =
          'v' + e.data.currentVersion + ' \\u2192 v' + e.data.latestVersion;
        var link = document.getElementById('update-link');
        link.href = e.data.releaseUrl;
        link.onclick = function(ev) { ev.preventDefault(); window.open(e.data.releaseUrl); };

        // Show pulsing dot on Release Notes tab
        document.getElementById('releases-dot').classList.add('visible');
      }
    }
    if (e.data && e.data.type === 'project-breakdown') {
      var list = document.getElementById('project-list');
      var projects = e.data.projects;
      if (!projects || projects.length === 0) {
        list.innerHTML = '<p class="no-projects">No active projects in the last 24 hours.</p>';
        return;
      }
      var maxTokens = projects[0].inputTokens + projects[0].outputTokens;
      var html = '';
      projects.forEach(function(p) {
        var total = p.inputTokens + p.outputTokens;
        var pct = maxTokens > 0 ? (total / maxTokens * 100) : 0;
        html += '<div class="project-row">' +
          '<span class="project-name" title="' + p.projectDir + '">' + p.projectDir + '</span>' +
          '<div class="project-bar-wrap"><div class="project-bar" style="width:' + pct + '%"></div></div>' +
          '<span class="project-tokens">' + fmtTokens(p.inputTokens) + ' in / ' + fmtTokens(p.outputTokens) + ' out</span>' +
          '</div>';
      });
      list.innerHTML = html;
    }
  });
</script>
</body>
</html>`;

export function openHelpWindow(): void {
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
    if (update) {
      helpWindow?.webContents.executeJavaScript(
        `window.postMessage(${JSON.stringify({ type: 'update-info', ...update })}, '*')`
      );
    }
    // Highlight current theme button
    const config = getConfig();
    helpWindow?.webContents.executeJavaScript(
      `document.querySelector('.theme-btn[data-theme="${config.theme || 'dark'}"]')?.classList.add('active')`
    );

    // Send project breakdown data
    const projects = getProjectBreakdown();
    helpWindow?.webContents.executeJavaScript(
      `window.postMessage(${JSON.stringify({ type: 'project-breakdown', projects })}, '*')`
    );
  });

  // Listen for theme changes via page title
  helpWindow.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    if (title.startsWith('theme:')) {
      const theme = title.slice(6) as ThemeName;
      if (['dark', 'light', 'sunset'].includes(theme)) {
        saveConfig({ theme });
        // Notify the main widget renderer
        const allWindows = BrowserWindow.getAllWindows();
        allWindows.forEach((w: Electron.BrowserWindow) => {
          if (w !== helpWindow) {
            w.webContents.send('widget:theme-change', theme);
          }
        });
      }
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

  ipcMain.on('widget:download-update', () => {
    const update = getCachedUpdate();
    if (!update || !update.latestDownloadUrl) return;

    downloadUpdate(
      update.latestDownloadUrl,
      (percent) => {
        mainWindow.webContents.send('widget:update-progress', percent);
      },
    ).then((installerPath) => {
      mainWindow.webContents.send('widget:update-ready', installerPath);
    }).catch((err) => {
      mainWindow.webContents.send('widget:update-error', err.message);
    });
  });

  ipcMain.on('widget:install-update', (_event, installerPath: string) => {
    runInstaller(installerPath);
  });

  ipcMain.on('widget:set-theme', (_event, theme: ThemeName) => {
    saveConfig({ theme });
    mainWindow.webContents.send('widget:theme-change', theme);
  });

  ipcMain.on('widget:request-theme', () => {
    const config = getConfig();
    mainWindow.webContents.send('widget:theme-change', config.theme || 'dark');
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

    // Check rate limits for notifications
    checkRateLimits(newState.limits.hourlyUsed, newState.limits.weeklyUsed);

    if (changed) {
      mainWindow.webContents.send('claude:usage-update', cachedState);
    }
  }, POLL_INTERVAL_STATS);

  // Initial push
  cachedState = buildState();
  mainWindow.webContents.send('claude:usage-update', cachedState);
  mainWindow.webContents.send('claude:activity-history', getActivityHistory());
}
