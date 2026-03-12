// src/renderer/hooks/useClaudeStats.ts
import { useState, useEffect } from 'react';
import { ClaudeUsageState, SnapEdge } from '../../shared/types';

declare global {
  interface Window {
    claudePulse: {
      onUsageUpdate: (callback: (state: ClaudeUsageState) => void) => void;
      onVisibility: (callback: (visible: boolean) => void) => void;
      onSnapEdge: (callback: (edge: SnapEdge) => void) => void;
      requestUpdate: () => void;
      requestSnapEdge: () => void;
    };
  }
}

const defaultState: ClaudeUsageState = {
  session: { isActive: false, pid: null, workspace: null, ideName: null },
  currentModel: null,
  tokens: { inputToday: 0, outputToday: 0, cacheReadToday: 0 },
  limits: { hourlyUsed: 0, hourlyEstimate: 0, weeklyUsed: 0, weeklyEstimate: 0 },
  plan: { subscriptionType: 'unknown', rateLimitTier: 'unknown' },
};

export function useClaudeStats() {
  const [state, setState] = useState<ClaudeUsageState>(defaultState);
  const [snapEdge, setSnapEdge] = useState<SnapEdge>('top');

  useEffect(() => {
    window.claudePulse.onUsageUpdate((newState) => setState(newState));
    window.claudePulse.onSnapEdge((edge) => setSnapEdge(edge));
    window.claudePulse.requestUpdate();
    window.claudePulse.requestSnapEdge();
  }, []);

  return { state, snapEdge };
}
