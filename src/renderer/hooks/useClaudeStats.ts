// src/renderer/hooks/useClaudeStats.ts
import { useState, useEffect, useCallback } from 'react';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot } from '../../shared/types';

declare global {
  interface Window {
    claudePulse: {
      onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => void;
      onActivityHistory: (callback: (history: ActivitySnapshot[]) => void) => void;
      onVisibility: (callback: (visible: boolean) => void) => void;
      onSnapEdge: (callback: (edge: SnapEdge) => void) => void;
      requestUpdate: () => void;
      requestSnapEdge: () => void;
      requestResize: (expanded: boolean) => void;
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
    window.claudePulse.onUsageUpdate((newState) => setState(newState));
    window.claudePulse.onActivityHistory((history) => setActivityHistory(history));
    window.claudePulse.onSnapEdge((edge) => setSnapEdge(edge));
    window.claudePulse.requestUpdate();
    window.claudePulse.requestSnapEdge();
  }, []);

  const toggleExpanded = useCallback(() => {
    const next = !isExpanded;
    setIsExpanded(next);
    window.claudePulse.requestResize(next);
  }, [isExpanded]);

  return { state, snapEdge, activityHistory, isExpanded, toggleExpanded };
}
