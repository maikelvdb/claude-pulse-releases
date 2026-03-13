// src/renderer/hooks/useClaudeStats.ts
import { useState, useEffect, useCallback } from 'react';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot, UpdateInfo } from '../../shared/types';

declare global {
  interface Window {
    claudePulse: {
      onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => () => void;
      onActivityHistory: (callback: (history: ActivitySnapshot[]) => void) => () => void;
      onVisibility: (callback: (visible: boolean) => void) => () => void;
      onSnapEdge: (callback: (edge: SnapEdge) => void) => () => void;
      requestUpdate: () => void;
      requestSnapEdge: () => void;
      onHover: (callback: (hovered: boolean) => void) => () => void;
      onToggleMinimize: (callback: () => void) => () => void;
      requestResize: (expanded: boolean) => void;
      openHelp: () => void;
      onUpdateInfo: (callback: (info: UpdateInfo) => void) => () => void;
      onConfirmQuit: (callback: () => void) => () => void;
      quit: () => void;
      downloadUpdate: () => void;
      onUpdateProgress: (callback: (percent: number) => void) => () => void;
      onUpdateReady: (callback: (path: string) => void) => () => void;
      onUpdateError: (callback: (error: string) => void) => () => void;
      installUpdate: (path: string) => void;
    };
  }
}

const defaultState: ClaudeUsageState = {
  session: { isActive: false, pid: null, workspace: null, ideName: null, source: null },
  currentModel: null,
  tokens: { inputToday: 0, outputToday: 0, cacheReadToday: 0 },
  limits: { hourlyUsed: 0, hourlyEstimate: 0, weeklyUsed: 0, weeklyEstimate: 0 },
  plan: { subscriptionType: 'unknown', rateLimitTier: 'unknown' },
};

export function useClaudeStats() {
  const [state, setState] = useState<ClaudeUsageState>(defaultState);
  const [snapEdge, setSnapEdge] = useState<SnapEdge>('top');
  const [activityHistory, setActivityHistory] = useState<ActivitySnapshot[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const cleanups = [
      window.claudePulse.onUsageUpdate((newState) => setState(newState)),
      window.claudePulse.onActivityHistory((history) => setActivityHistory(history)),
      window.claudePulse.onSnapEdge((edge) => setSnapEdge(edge)),
    ];
    window.claudePulse.requestUpdate();
    window.claudePulse.requestSnapEdge();
    return () => cleanups.forEach(cleanup => cleanup());
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      window.claudePulse.requestResize(next);
      return next;
    });
  }, []);

  return { state, snapEdge, activityHistory, isExpanded, toggleExpanded };
}
