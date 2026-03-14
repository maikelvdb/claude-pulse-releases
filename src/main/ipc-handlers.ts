import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { marked } from 'marked';
import { getActiveSession } from './services/session-watcher';
import { getTodayTokenUsage } from './services/stats-reader';
import { getPlanInfo } from './services/credentials-reader';
import { getCurrentModel, getUsageLimits } from './services/session-parser';
import { recordSnapshot, getActivityHistory, getDailyRollups } from './services/activity-store';
import { getCachedUpdate, checkForUpdate, downloadUpdate, runInstaller } from './services/update-checker';
import { checkRateLimits } from './services/rate-limit-notifier';
import { getCachedCliStatus } from './services/cli-status-poller';
import { log, getLogBuffer, clearLogBuffer, onLogEntry, LogEntry } from './services/logger';
import { getProjectBreakdown } from './services/project-scanner';
import { getModelBreakdown } from './services/model-breakdown';
import { ClaudeUsageState, ThemeName, Achievement } from '../shared/types';
import { getAchievements, unlock, MILESTONE_MAP } from './services/achievement-store';
import { POLL_INTERVAL_SESSION, POLL_INTERVAL_STATS } from '../shared/constants';
import { getSnapEdge, resizeForExpand, resizeForCompact, setPositionLocked, getWindow } from './window-manager';
import { saveConfig, getConfig } from './services/config-store';

let cachedState: ClaudeUsageState | null = null;
let sessionStartedAt: number | null = null;
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
.header-btns {
  -webkit-app-region: no-drag;
  position: absolute; top: 16px; right: 20px;
  display: flex; gap: 6px;
}
.header-btn {
  background: none; border: 1px solid #444; color: #888;
  font-size: 14px; cursor: pointer; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; line-height: 1;
}
.header-btn:hover { color: #E87443; border-color: #E87443; }

/* Settings overlay */
.settings-overlay {
  position: fixed; inset: 0; background: #1a1a2e; z-index: 100;
  display: none; flex-direction: column;
}
.settings-overlay.visible { display: flex; }
.settings-header {
  padding: 20px 24px 16px;
  display: flex; align-items: center; gap: 10px;
  border-bottom: 1px solid #333346;
  flex-shrink: 0;
}
.settings-header h2 { color: #E87443; font-size: 16px; flex: 1; margin: 0; border: none; padding: 0; }
.settings-back {
  background: none; border: 1px solid #444; color: #888;
  font-size: 14px; cursor: pointer; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px; line-height: 1;
}
.settings-back:hover { color: #E87443; border-color: #E87443; }
.settings-body {
  flex: 1; overflow-y: auto; padding: 16px 24px 24px;
}
.settings-body::-webkit-scrollbar { width: 6px; }
.settings-body::-webkit-scrollbar-track { background: transparent; }
.settings-body::-webkit-scrollbar-thumb { background: #333346; border-radius: 3px; }
.settings-group { margin-bottom: 20px; }
.settings-group-title {
  font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
  color: #666; margin-bottom: 8px;
}

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
  padding: 8px 10px;
  font-size: 11px;
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
  color: #999; font-size: 12px; line-height: 1.6;
}
.release-notes-content h2 { color: #e0e0f0; font-size: 14px; margin: 14px 0 6px; border-bottom: 1px solid #333346; padding-bottom: 4px; }
.release-notes-content h3 { color: #c8c8d8; font-size: 13px; margin: 10px 0 4px; }
.release-notes-content ul { margin: 4px 0 8px 16px; padding: 0; }
.release-notes-content li { margin-bottom: 3px; }
.release-notes-content strong { color: #c8c8d8; }
.release-notes-content code { background: #2a2a3e; padding: 1px 5px; border-radius: 3px; font-size: 11px; color: #E87443; }
.release-notes-content a { color: #E87443; text-decoration: none; }
.release-notes-content a:hover { text-decoration: underline; }
.release-notes-content p { margin-bottom: 6px; }
.update-btn {
  display: inline-block; padding: 6px 16px; border-radius: 6px;
  background: #E87443; color: #fff; font-size: 12px; font-weight: 500;
  border: none; cursor: pointer; transition: background 0.2s;
}
.update-btn:hover { background: #d4632e; }
.update-btn.retry { background: #2a2a3e; color: #c8c8d8; border: 1px solid #444; }
.update-btn.retry:hover { background: #333346; }
.update-link {
  color: #E87443; text-decoration: none; font-size: 11px;
  display: inline-block; margin-left: 10px;
}
.update-link:hover { text-decoration: underline; }
.progress-bar {
  width: 100%; height: 6px; background: #2a2a3e; border-radius: 3px;
  overflow: hidden; margin-top: 8px;
}
.progress-fill {
  height: 100%; background: #E87443; border-radius: 3px;
  transition: width 0.3s; width: 0%;
}
.progress-text { font-size: 10px; color: #888; margin-top: 4px; display: inline-block; }
.error-text { font-size: 11px; color: #f87171; display: block; margin-bottom: 6px; }
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

.settings-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.settings-label { font-size: 12px; color: #c8c8d8; }
.settings-sublabel { font-size: 10px; color: #666; }
.toggle {
  position: relative; width: 36px; height: 20px; border-radius: 10px;
  background: #2a2a3e; border: 1px solid #444; cursor: pointer; transition: background 0.2s;
}
.toggle.on { background: #E87443; border-color: #E87443; }
.toggle-knob {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: #fff; transition: left 0.2s;
}
.toggle.on .toggle-knob { left: 18px; }
input[type="range"] {
  -webkit-appearance: none; width: 140px; height: 4px; border-radius: 2px;
  background: #2a2a3e; outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: #E87443; cursor: pointer;
}
.opacity-value { font-size: 11px; color: #888; width: 30px; text-align: right; }

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

.heatmap-cell {
  width: 5px; height: 5px; border-radius: 1px;
  background: #E87443;
}

/* Console tab */
#tab-console { overflow: hidden; display: none; }
#tab-console.active { display: flex; }
.console-wrap {
  display: flex; flex-direction: column; flex: 1; min-height: 0;
  width: 100%;
}
.console-toolbar {
  display: flex; justify-content: flex-end; padding: 0 0 8px;
  flex-shrink: 0;
}
.console-clear-btn {
  background: #2a2a3e; border: 1px solid #444; color: #888;
  font-size: 11px; padding: 2px 10px; border-radius: 4px; cursor: pointer;
}
.console-clear-btn:hover { color: #E87443; border-color: #E87443; }
.console-output {
  flex: 1; overflow-y: auto; background: #0d0d1a; border-radius: 6px;
  padding: 10px 12px; font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 11px; line-height: 1.7; min-height: 0;
  user-select: text; -webkit-user-select: text; cursor: text;
}
.console-output::-webkit-scrollbar { width: 6px; }
.console-output::-webkit-scrollbar-track { background: transparent; }
.console-output::-webkit-scrollbar-thumb { background: #333346; border-radius: 3px; }
.console-output::-webkit-scrollbar-thumb:hover { background: #444; }
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-line .ts { color: #555; }
.log-line .src { color: #6a9fb5; }
.log-line.info .msg { color: #b0b0c0; }
.log-line.warn .ts, .log-line.warn .src, .log-line.warn .msg { color: #e2b340; }
.log-line.error .ts, .log-line.error .src, .log-line.error .msg { color: #f87171; }
.log-line { cursor: pointer; padding: 1px 4px; border-radius: 3px; }
.log-line:hover { background: #1a1a2e; }
.console-empty { color: #555; font-style: italic; font-size: 12px; }
.copy-toast {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: #22c55e; color: #fff; font-size: 12px; font-weight: 600;
  padding: 6px 16px; border-radius: 6px; z-index: 999;
  opacity: 0; transition: opacity 0.2s;
  pointer-events: none;
}
.copy-toast.show { opacity: 1; }

/* Achievements tab */
.achievement-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 0;
  border-bottom: 1px solid #333346;
}
.achievement-row:last-child { border-bottom: none; }
.achievement-icon {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
  background: #2a2a3e; border: 2px solid #444;
}
.achievement-row.unlocked .achievement-icon {
  background: #E8744330; border-color: #E87443;
}
.achievement-info { flex: 1; }
.achievement-name { font-size: 13px; color: #666; font-weight: 500; }
.achievement-row.unlocked .achievement-name { color: #e0e0f0; }
.achievement-desc { font-size: 11px; color: #555; }
.achievement-row.unlocked .achievement-desc { color: #888; }
.achievement-date { font-size: 10px; color: #E87443; }

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
  <div class="header-btns">
    <button class="header-btn" id="settings-btn" title="Settings">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
    <button class="header-btn" onclick="window.close()" title="Close">&times;</button>
  </div>
</div>

<!-- Settings overlay -->
<div class="settings-overlay" id="settings-overlay">
  <div class="settings-header">
    <button class="settings-back" id="settings-back" title="Back">&larr;</button>
    <h2>Settings</h2>
  </div>
  <div class="settings-body">
    <div class="settings-group">
      <div class="settings-group-title">Appearance</div>
      <div class="section">
        <div class="theme-picker">
          <button class="theme-btn settings-theme-btn" data-theme="dark" title="Dark">
            <span class="theme-swatch" style="background:#1e1e2e;border-color:#333346"></span> Dark
          </button>
          <button class="theme-btn settings-theme-btn" data-theme="light" title="Light">
            <span class="theme-swatch" style="background:#f5f5f7;border-color:#c8c8d8"></span> Light
          </button>
          <button class="theme-btn settings-theme-btn" data-theme="sunset" title="Sunset">
            <span class="theme-swatch" style="background:#2d1b2e;border-color:#4d3b4e"></span> Sunset
          </button>
        </div>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-label">Opacity</div>
          <div class="settings-sublabel">Min 15%</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="range" id="opacity-slider" min="15" max="100" value="100" />
          <span class="opacity-value" id="opacity-value">100%</span>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Behavior</div>
      <div class="settings-row">
        <div>
          <div class="settings-label">Lock position</div>
          <div class="settings-sublabel">Prevent accidental drags</div>
        </div>
        <div class="toggle" id="lock-toggle"><div class="toggle-knob"></div></div>
      </div>
      <div class="settings-row">
        <div>
          <div class="settings-label">Start on login</div>
          <div class="settings-sublabel">Launch when Windows starts</div>
        </div>
        <div class="toggle" id="autostart-toggle"><div class="toggle-knob"></div></div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Notifications</div>
      <div class="settings-row">
        <div>
          <div class="settings-label">Mute sounds</div>
          <div class="settings-sublabel">Disable all sound effects</div>
        </div>
        <div class="toggle" id="mute-toggle"><div class="toggle-knob"></div></div>
      </div>
    </div>
  </div>
</div>

<div class="tabs">
  <button class="tab active" data-tab="general">General</button>
  <button class="tab" data-tab="shortcuts">Shortcuts</button>
  <button class="tab" data-tab="projects">Projects</button>
  <button class="tab" data-tab="history">History</button>
  <button class="tab" data-tab="releases">
    Release Notes
    <span class="tab-dot" id="releases-dot"></span>
  </button>
  <button class="tab" data-tab="achievements">Achievements</button>
  <button class="tab" data-tab="console">Console</button>
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
        <tr><td><kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd></td>
            <td>Cycle theme (Dark &rarr; Light &rarr; Sunset)</td></tr>
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
    <div class="section">
      <h2>Token Usage by Model (24h)</h2>
      <div id="model-list"><p style="color:#666">Loading...</p></div>
    </div>
  </div>

  <!-- History tab -->
  <div class="tab-panel" id="tab-history">
    <div class="section">
      <div id="history-stats"></div>
      <h2>Token Usage (52 weeks)</h2>
      <div id="heatmap-grid" style="display:flex;gap:2px;flex-wrap:wrap;max-width:390px"></div>
    </div>
  </div>

  <!-- Release Notes tab -->
  <div class="tab-panel" id="tab-releases">
    <div id="update-banner" class="update-banner">
      <h3><span class="dot"></span> Update Available</h3>
      <div class="version" id="update-version"></div>
      <div id="update-actions">
        <button class="update-btn" id="download-btn">Download &amp; Install</button>
        <a class="update-link" id="update-link" href="#" target="_blank">View on GitHub &rarr;</a>
      </div>
      <div id="update-progress" style="display:none">
        <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
        <span class="progress-text" id="progress-text">0%</span>
      </div>
      <div id="update-ready" style="display:none">
        <button class="update-btn" id="install-btn">Install Now &amp; Restart</button>
      </div>
      <div id="update-error" style="display:none">
        <span class="error-text" id="error-text"></span>
        <button class="update-btn retry" id="retry-btn">Retry</button>
      </div>
    </div>

    <div class="section">
      <h2>Latest Release</h2>
      <div class="release-notes-content" id="release-notes">No release information available.</div>
    </div>

    <p class="current-version" id="current-version"></p>
  </div>

  <!-- Achievements tab -->
  <div class="tab-panel" id="tab-achievements">
    <div class="section">
      <h2>Achievements</h2>
      <div id="achievements-list"><p style="color:#666">Loading...</p></div>
    </div>
  </div>

  <!-- Console tab -->
  <div class="tab-panel" id="tab-console">
    <div class="console-wrap">
      <div class="console-toolbar">
        <button class="console-clear-btn" id="console-clear">Clear</button>
      </div>
      <div class="console-output" id="console-output">
        <div class="console-empty">Waiting for log entries...</div>
      </div>
    </div>
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

  // Settings overlay
  var settingsOverlay = document.getElementById('settings-overlay');
  document.getElementById('settings-btn').addEventListener('click', function() {
    settingsOverlay.classList.add('visible');
  });
  document.getElementById('settings-back').addEventListener('click', function() {
    settingsOverlay.classList.remove('visible');
  });

  // Format token count
  function fmtTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  // Theme switching — communicate via page title
  document.querySelectorAll('.settings-theme-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var theme = btn.dataset.theme;
      document.querySelectorAll('.settings-theme-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.title = 'theme:' + theme;
    });
  });

  // Settings controls
  var opacitySlider = document.getElementById('opacity-slider');
  var opacityValue = document.getElementById('opacity-value');
  var opacityTimer = null;
  opacitySlider.addEventListener('input', function() {
    var val = parseInt(opacitySlider.value);
    opacityValue.textContent = val + '%';
    if (opacityTimer) clearTimeout(opacityTimer);
    opacityTimer = setTimeout(function() {
      document.title = 'opacity:' + (val / 100);
    }, 150);
  });

  document.getElementById('lock-toggle').addEventListener('click', function() {
    this.classList.toggle('on');
    document.title = 'lock:' + (this.classList.contains('on') ? '1' : '0');
  });

  document.getElementById('autostart-toggle').addEventListener('click', function() {
    this.classList.toggle('on');
    document.title = 'autostart:' + (this.classList.contains('on') ? '1' : '0');
  });

  document.getElementById('mute-toggle').addEventListener('click', function() {
    this.classList.toggle('on');
    document.title = 'soundmute:' + (this.classList.contains('on') ? '1' : '0');
  });

  // Copy toast
  var toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = 'Copied!';
  document.body.appendChild(toast);
  var toastTimer = null;

  function showCopyToast() {
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toast.classList.remove('show'); }, 2000);
  }

  // Console log handling
  var consoleOutput = document.getElementById('console-output');
  var consoleHasEntries = false;

  function padTwo(n) { return n < 10 ? '0' + n : '' + n; }

  function appendLogEntry(entry) {
    if (!consoleHasEntries) {
      consoleOutput.innerHTML = '';
      consoleHasEntries = true;
    }
    var d = new Date(entry.timestamp);
    var ts = padTwo(d.getHours()) + ':' + padTwo(d.getMinutes()) + ':' + padTwo(d.getSeconds());
    var rawText = ts + ' [' + entry.source + '] ' + entry.message;
    var div = document.createElement('div');
    div.className = 'log-line ' + entry.level;
    div.innerHTML = '<span class="ts">' + ts + '</span> <span class="src">[' + entry.source + ']</span> <span class="msg">' + entry.message.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>';
    div.title = 'Click to copy';
    div.addEventListener('click', function() {
      navigator.clipboard.writeText(rawText).then(showCopyToast);
    });
    consoleOutput.insertBefore(div, consoleOutput.firstChild);
  }

  document.getElementById('console-clear').addEventListener('click', function() {
    consoleOutput.innerHTML = '<div class="console-empty">Console cleared.</div>';
    consoleHasEntries = false;
    document.title = 'action:clear-logs';
  });

  // Update info
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'update-info') {
      document.getElementById('header-version').textContent = 'v' + e.data.currentVersion;
      document.getElementById('current-version').textContent = 'Current version: v' + e.data.currentVersion;

      if (e.data.releaseNotes) {
        document.getElementById('release-notes').innerHTML = e.data.releaseNotes;
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

        // Wire download button
        document.getElementById('download-btn').onclick = function() {
          document.getElementById('update-actions').style.display = 'none';
          document.getElementById('update-progress').style.display = 'block';
          document.title = 'action:download';
        };
        document.getElementById('install-btn').onclick = function() {
          document.title = 'action:install';
        };
        document.getElementById('retry-btn').onclick = function() {
          document.getElementById('update-error').style.display = 'none';
          document.getElementById('update-progress').style.display = 'block';
          document.getElementById('progress-fill').style.width = '0%';
          document.getElementById('progress-text').textContent = '0%';
          document.title = 'action:download';
        };
      }
    }
    if (e.data && e.data.type === 'settings') {
      document.getElementById('opacity-slider').value = Math.round(e.data.opacity * 100);
      document.getElementById('opacity-value').textContent = Math.round(e.data.opacity * 100) + '%';
      if (e.data.positionLocked) document.getElementById('lock-toggle').classList.add('on');
      if (e.data.autoStart) document.getElementById('autostart-toggle').classList.add('on');
      if (e.data.soundMuted) document.getElementById('mute-toggle').classList.add('on');
    }
    if (e.data && e.data.type === 'update-progress') {
      document.getElementById('progress-fill').style.width = e.data.percent + '%';
      document.getElementById('progress-text').textContent = e.data.percent + '% downloading...';
    }
    if (e.data && e.data.type === 'update-ready') {
      document.getElementById('update-progress').style.display = 'none';
      document.getElementById('update-ready').style.display = 'block';
    }
    if (e.data && e.data.type === 'update-error') {
      document.getElementById('update-progress').style.display = 'none';
      document.getElementById('update-error').style.display = 'block';
      document.getElementById('error-text').textContent = e.data.message;
    }
    if (e.data && e.data.type === 'daily-rollups') {
      var rollups = e.data.rollups;
      var grid = document.getElementById('heatmap-grid');
      var today = new Date();
      var cells = [];
      var maxTotal = 0;
      for (var i = 363; i >= 0; i--) {
        var d = new Date(today);
        d.setDate(d.getDate() - i);
        var key = d.toISOString().slice(0, 10);
        var r = rollups[key];
        var total = r ? r.input + r.output : 0;
        if (total > maxTotal) maxTotal = total;
        cells.push({ date: key, total: total });
      }
      var html = '';
      cells.forEach(function(c) {
        var opacity = c.total === 0 ? 0.08 : Math.max(0.2, c.total / maxTotal);
        html += '<div class="heatmap-cell" style="opacity:' + opacity + '" title="' + c.date + ': ' + fmtTokens(c.total) + ' tokens"></div>';
      });
      grid.innerHTML = html;

      // Stats
      var thisWeek = 0, thisMonth = 0, allTime = 0;
      var weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
      var monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);
      Object.keys(rollups).forEach(function(k) {
        var t = rollups[k].input + rollups[k].output;
        allTime += t;
        if (k >= weekAgo.toISOString().slice(0, 10)) thisWeek += t;
        if (k >= monthAgo.toISOString().slice(0, 10)) thisMonth += t;
      });
      document.getElementById('history-stats').innerHTML =
        '<p style="font-size:12px;margin-bottom:12px;color:#888">' +
        'This week: <strong style="color:#c8c8d8">' + fmtTokens(thisWeek) + '</strong> &middot; ' +
        'This month: <strong style="color:#c8c8d8">' + fmtTokens(thisMonth) + '</strong> &middot; ' +
        'All time: <strong style="color:#c8c8d8">' + fmtTokens(allTime) + '</strong></p>';
    }
    if (e.data && e.data.type === 'achievements') {
      var achs = e.data.achievements;
      var icons = { tokens_500k: '\\u26A1', tokens_1m: '\\uD83D\\uDD25', tokens_5m: '\\uD83D\\uDE80', tokens_10m: '\\uD83C\\uDFC6' };
      var html = '';
      achs.forEach(function(a) {
        var unlocked = !!a.unlockedAt;
        var icon = icons[a.id] || '\\u2B50';
        var dateStr = '';
        if (unlocked) {
          var d = new Date(a.unlockedAt);
          dateStr = d.toLocaleDateString() + ' ' + padTwo(d.getHours()) + ':' + padTwo(d.getMinutes());
        }
        html += '<div class="achievement-row ' + (unlocked ? 'unlocked' : '') + '">' +
          '<div class="achievement-icon">' + (unlocked ? icon : '\\uD83D\\uDD12') + '</div>' +
          '<div class="achievement-info">' +
            '<div class="achievement-name">' + a.name + '</div>' +
            '<div class="achievement-desc">' + a.description + '</div>' +
            (unlocked ? '<div class="achievement-date">Unlocked ' + dateStr + '</div>' : '') +
          '</div></div>';
      });
      document.getElementById('achievements-list').innerHTML = html;
    }
    if (e.data && e.data.type === 'log-buffer') {
      var entries = e.data.entries;
      for (var i = entries.length - 1; i >= 0; i--) {
        appendLogEntry(entries[i]);
      }
    }
    if (e.data && e.data.type === 'log-entry') {
      appendLogEntry(e.data.entry);
    }
    if (e.data && (e.data.type === 'model-breakdown' || e.data.type === 'project-breakdown')) {
      var isModel = e.data.type === 'model-breakdown';
      var targetEl = document.getElementById(isModel ? 'model-list' : 'project-list');
      var items = isModel ? e.data.models : e.data.projects;
      var emptyMsg = isModel ? 'No model usage in the last 24 hours.' : 'No active projects in the last 24 hours.';
      if (!items || items.length === 0) {
        targetEl.innerHTML = '<p class="no-projects">' + emptyMsg + '</p>';
        return;
      }
      var maxTotal = items[0].inputTokens + items[0].outputTokens;
      var html = '';
      items.forEach(function(item) {
        var total = item.inputTokens + item.outputTokens;
        var pct = maxTotal > 0 ? (total / maxTotal * 100) : 0;
        var label = item.model || item.projectDir;
        html += '<div class="project-row">' +
          '<span class="project-name" title="' + label + '">' + label + '</span>' +
          '<div class="project-bar-wrap"><div class="project-bar" style="width:' + pct + '%"></div></div>' +
          '<span class="project-tokens">' + fmtTokens(item.inputTokens) + ' in / ' + fmtTokens(item.outputTokens) + ' out</span>' +
          '</div>';
      });
      targetEl.innerHTML = html;
    }
  });
</script>
</body>
</html>`;

function sendUpdateToHelp(update: import('./services/update-checker').UpdateInfo | null): void {
  if (!helpWindow || helpWindow.isDestroyed() || !update) return;
  const payload = {
    type: 'update-info',
    ...update,
    releaseNotes: update.releaseNotes ? marked(update.releaseNotes) : '',
  };
  helpWindow.webContents.executeJavaScript(
    `window.postMessage(${JSON.stringify(payload)}, '*')`
  );
}

export function openHelpWindow(): void {
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.focus();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;
  const w = 560;
  const h = 520;

  helpWindow = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round((sw - w) / 2),
    y: Math.round((sh - h) / 2),
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  helpWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HELP_HTML)}`);

  helpWindow.webContents.on('did-finish-load', () => {
    // Send cached update immediately, then refresh in background
    sendUpdateToHelp(getCachedUpdate());
    checkForUpdate().then((fresh) => sendUpdateToHelp(fresh));
    if (!helpWindow || helpWindow.isDestroyed()) return;
    const config = getConfig();
    const projects = getProjectBreakdown();
    const models = getModelBreakdown();
    const rollups = getDailyRollups();
    const settings = {
      type: 'settings',
      opacity: config.opacity ?? 1,
      positionLocked: !!config.positionLocked,
      autoStart: !!config.autoStart,
      soundMuted: !!config.soundMuted,
    };
    const achievements = getAchievements();
    helpWindow.webContents.executeJavaScript(`
      document.querySelector('.settings-theme-btn[data-theme="${config.theme || 'dark'}"]')?.classList.add('active');
      window.postMessage(${JSON.stringify({ type: 'project-breakdown', projects })}, '*');
      window.postMessage(${JSON.stringify({ type: 'model-breakdown', models })}, '*');
      window.postMessage(${JSON.stringify({ type: 'daily-rollups', rollups })}, '*');
      window.postMessage(${JSON.stringify({ type: 'achievements', achievements })}, '*');
      window.postMessage(${JSON.stringify(settings)}, '*');
    `);

    // Send buffered log entries
    const logBuffer = getLogBuffer();
    if (logBuffer.length > 0) {
      helpWindow.webContents.executeJavaScript(
        `window.postMessage(${JSON.stringify({ type: 'log-buffer', entries: logBuffer })}, '*')`
      );
    }
  });

  // Stream new log entries to help window
  const removeLogListener = onLogEntry((entry: LogEntry) => {
    if (!helpWindow || helpWindow.isDestroyed()) return;
    helpWindow.webContents.executeJavaScript(
      `window.postMessage(${JSON.stringify({ type: 'log-entry', entry })}, '*')`
    );
  });

  // Listen for actions via page title
  let installerPath = '';
  helpWindow.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    if (title.startsWith('theme:')) {
      const theme = title.slice(6) as ThemeName;
      if (['dark', 'light', 'sunset'].includes(theme)) {
        saveConfig({ theme });
        const allWindows = BrowserWindow.getAllWindows();
        allWindows.forEach((w: Electron.BrowserWindow) => {
          if (w !== helpWindow) {
            w.webContents.send('widget:theme-change', theme);
          }
        });
      }
    } else if (title === 'action:download') {
      const update = getCachedUpdate();
      if (!update || !update.latestDownloadUrl) return;
      downloadUpdate(
        update.latestDownloadUrl,
        (percent) => {
          helpWindow?.webContents.executeJavaScript(
            `window.postMessage({type:'update-progress',percent:${percent}},'*')`
          );
        },
      ).then((path) => {
        installerPath = path;
        helpWindow?.webContents.executeJavaScript(
          `window.postMessage({type:'update-ready'},'*')`
        );
      }).catch((err) => {
        helpWindow?.webContents.executeJavaScript(
          `window.postMessage({type:'update-error',message:${JSON.stringify(err.message)}},'*')`
        );
      });
    } else if (title === 'action:install') {
      if (installerPath) runInstaller(installerPath);
    } else if (title.startsWith('opacity:')) {
      const val = parseFloat(title.slice(8));
      if (!isNaN(val)) {
        const clamped = Math.max(0.15, Math.min(1, val));
        saveConfig({ opacity: clamped });
        getWindow()?.setOpacity(clamped);
      }
    } else if (title.startsWith('lock:')) {
      const locked = title.slice(5) === '1';
      saveConfig({ positionLocked: locked });
      setPositionLocked(locked);
    } else if (title.startsWith('autostart:')) {
      const enabled = title.slice(10) === '1';
      saveConfig({ autoStart: enabled });
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: enabled });
      }
    } else if (title.startsWith('soundmute:')) {
      const muted = title.slice(10) === '1';
      saveConfig({ soundMuted: muted });
      const allWindows = BrowserWindow.getAllWindows();
      allWindows.forEach((w: Electron.BrowserWindow) => {
        if (w !== helpWindow) {
          w.webContents.send('widget:sound-muted', muted);
        }
      });
    } else if (title === 'action:clear-logs') {
      clearLogBuffer();
    }
  });

  helpWindow.on('closed', () => {
    removeLogListener();
    helpWindow = null;
  });
}

function buildState(): ClaudeUsageState {
  const session = getActiveSession();
  const tokens = getTodayTokenUsage();
  const plan = getPlanInfo();
  const currentModel = getCurrentModel();
  let limits = getUsageLimits(
    plan.rateLimitTier,
    tokens.inputLastHour,
    tokens.outputLastHour,
    tokens.inputToday,
    tokens.outputToday
  );

  const cliStatus = getCachedCliStatus();

  // Override limits with CLI data when available and fresh (< 60s old)
  if (cliStatus && Date.now() - cliStatus.lastUpdated < 60_000) {
    log('state', 'info', 'Using CLI status override (session: ' + cliStatus.sessionPercent + '%, weekly: ' + cliStatus.weeklyPercent + '%)');
    limits = {
      ...limits,
      hourlyUsed: cliStatus.sessionPercent / 100,
      weeklyUsed: cliStatus.weeklyPercent / 100,
    };
  }

  return { session, currentModel, tokens, limits, plan, sessionStartedAt, cliStatus };
}

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // Respond to manual requests
  ipcMain.on('claude:request-update', () => {
    cachedState = buildState();
    mainWindow.webContents.send('claude:usage-update', cachedState);
    mainWindow.webContents.send('claude:activity-history', getActivityHistory());
    mainWindow.webContents.send('claude:daily-rollups', getDailyRollups());
  });

  ipcMain.on('widget:request-snap-edge', () => {
    mainWindow.webContents.send('widget:snap-edge', getSnapEdge());
  });

  ipcMain.on('widget:resize', (_event, expanded: boolean) => {
    resizeForExpand(expanded);
  });

  ipcMain.on('widget:compact', (_event, compact: boolean) => {
    resizeForCompact(compact);
  });

  ipcMain.on('widget:open-help', () => {
    openHelpWindow();
  });

  ipcMain.handle('achievements:list', () => getAchievements());

  ipcMain.handle('achievements:unlock', (_event, id: string) => {
    return unlock(id);
  });

  ipcMain.handle('achievements:milestone-map', () => MILESTONE_MAP);

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
      if (newSession.isActive) {
        sessionStartedAt = Date.now();
      } else {
        sessionStartedAt = null;
      }
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
    mainWindow.webContents.send('claude:daily-rollups', getDailyRollups());

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
  if (cachedState.session.isActive) sessionStartedAt = Date.now();
  mainWindow.webContents.send('claude:usage-update', cachedState);
  mainWindow.webContents.send('claude:activity-history', getActivityHistory());
  mainWindow.webContents.send('claude:daily-rollups', getDailyRollups());
}
