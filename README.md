# Claude Pulse

A desktop widget that monitors your [Claude Code](https://docs.anthropic.com/en/docs/claude-code) usage in real-time. Sits on the edge of your screen and shows live session stats, token usage, activity charts, and rate limits.

![Claude Pulse Icon](build/icon-256.png)

## Features

- **Session indicator** - Shows if a Claude session is active and which model is in use
- **Token counter** - Displays input / output / cache tokens used in the current session
- **Activity chart** - Live 5-minute line chart of token usage (orange = input, green = output)
- **Expanded graph** - Click the chart to expand a detailed 1-hour activity view
- **Rate limit bars** - Hourly and weekly rate-limit usage at a glance
- **Animated mascot** - Clawd animates when a session is active, pauses when idle
- **Edge snapping** - Drag the widget to any screen edge (top, bottom, left, right)
- **Auto show/hide** - Appears when a Claude session is detected, hides after inactivity
- **Update checker** - Pulsing indicator on the help button when a new version is available
- **Always on top** - Stays visible above all other applications

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+P` | Toggle widget show / hide |
| `Ctrl+Shift+Q` | Quit (with confirmation) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- An active [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installation

### Development

```bash
npm install
npm run dev
```

This starts the renderer dev server on `localhost:3000` and launches Electron.

### Build

```bash
npm run build
```

### Package (installer)

```bash
npm run package
```

Produces platform-specific installers in the `release/` folder:
- **Windows**: NSIS installer (`.exe`)
- **macOS**: DMG (`.dmg`)
- **Linux**: AppImage (`.AppImage`)

## How It Works

Claude Pulse reads data directly from Claude Code's local files:

- **Session detection** - Monitors `~/.claude/ide/` lock files and `~/.claude/stats-cache.json` for active sessions
- **Token usage** - Parses live JSONL session files incrementally (byte-offset caching for performance)
- **Rate limits** - Estimates hourly/weekly usage based on subscription tier
- **Activity history** - Records snapshots every 10 seconds, persisted to `~/.claude/claude-pulse-activity.json`

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI components
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety
- **Webpack** - Bundling

## License

ISC
