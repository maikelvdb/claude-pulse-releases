# Claude Pulse — Snapping & Logo Update Design

**Date:** 2026-03-12
**Status:** Approved

## Overview

Add Claude logo branding, replace free positioning with edge-snapping behavior, and adapt layout orientation based on which screen edge the widget is docked to.

## Changes

### 1. Claude Logo

- Orange Claude sparkle/asterisk icon + "Claude Pulse" text label
- Positioned as the leftmost element in horizontal mode, topmost in vertical mode
- Sits before the session indicator
- Icon is an inline SVG of the Claude sparkle mark

### 2. Edge Snapping

- Widget snaps to any of 4 screen edges: top (default), bottom, left, right
- Centered along the snapped edge
- User drags to reposition — on release, snaps to the nearest edge
- Drag uses `-webkit-app-region: drag` but constrains final position to edge-snap only
- Position preference persisted to `~/.claude/claude-pulse-config.json`

### 3. Layout Adaptation

**Horizontal mode (top/bottom edge):**
- Current layout: logo | session dot + model | tokens | hour bar + week bar
- Bar dimensions: ~480x60px (slightly wider to fit logo)
- Top edge: rounded bottom corners. Bottom edge: rounded top corners.

**Vertical mode (left/right edge):**
- Elements stacked vertically: logo, session indicator, token counter, hour bar, week bar
- Bar dimensions: ~80x320px
- Left edge: rounded right corners. Right edge: rounded left corners.
- Limit bars render vertically (rotated or vertical fill)
- Text labels may be abbreviated or hidden to fit

### 4. Auto-Show Trigger Zones

Trigger zone moves with the snapped edge:
- Top: mouse y <= 10, within bar width of center-x
- Bottom: mouse y >= screenHeight - 10, within bar width of center-x
- Left: mouse x <= 10, within bar height of center-y
- Right: mouse x >= screenWidth - 10, within bar height of center-y

### 5. Slide Animation Direction

Animation direction matches snapped edge:
- Top: slides down from above
- Bottom: slides up from below
- Left: slides right from left
- Right: slides left from right

### 6. Config Persistence

File: `~/.claude/claude-pulse-config.json`

```json
{
  "snapEdge": "top"
}
```

Read on startup, written on snap change.

## Files Affected

- `src/shared/constants.ts` — new dimensions, config file path
- `src/shared/types.ts` — SnapEdge type, config type
- `src/main/window-manager.ts` — snap logic, position calculation, drag handling, config persistence
- `src/main/index.ts` — updated trigger zone logic
- `src/main/ipc-handlers.ts` — new IPC channel for snap changes
- `src/preload/index.ts` — expose snap IPC
- `src/renderer/App.tsx` — orientation-aware layout
- `src/renderer/components/StatusBar.tsx` — horizontal/vertical variants
- `src/renderer/components/ClaudeLogo.tsx` — new component
- `src/renderer/components/LimitBar.tsx` — vertical variant
- `src/renderer/styles/globals.css` — animation direction variants
