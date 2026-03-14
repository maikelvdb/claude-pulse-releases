// src/renderer/hooks/useClaudeStats.ts
import { useState, useEffect, useCallback } from 'react';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot, UpdateInfo, ThemeName, DailyRollups } from '../../shared/types';

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
      setCompact: (compact: boolean) => void;
      openHelp: () => void;
      onUpdateInfo: (callback: (info: UpdateInfo) => void) => () => void;
      onConfirmQuit: (callback: () => void) => () => void;
      quit: () => void;
      downloadUpdate: () => void;
      onUpdateProgress: (callback: (percent: number) => void) => () => void;
      onUpdateReady: (callback: (path: string) => void) => () => void;
      onUpdateError: (callback: (error: string) => void) => () => void;
      installUpdate: (path: string) => void;
      onConversationPreview: (callback: (msg: string) => void) => () => void;
      onSoundMuted: (callback: (muted: boolean) => void) => () => void;
      onDailyRollups: (callback: (rollups: import('../../shared/types').DailyRollups) => void) => () => void;
      onThemeChange: (callback: (theme: ThemeName) => void) => () => void;
      setTheme: (theme: ThemeName) => void;
      requestTheme: () => void;
    };
  }
}

const defaultState: ClaudeUsageState = {
  session: { isActive: false, pid: null, workspace: null, ideName: null, source: null, sessionCount: 0 },
  sessionStartedAt: null,
  currentModel: null,
  tokens: { inputToday: 0, outputToday: 0, cacheReadToday: 0, inputLastHour: 0, outputLastHour: 0 },
  limits: { hourlyUsed: 0, hourlyEstimate: 0, weeklyUsed: 0, weeklyEstimate: 0 },
  plan: { subscriptionType: 'unknown', rateLimitTier: 'unknown' },
  cliStatus: null,
};

export function useClaudeStats() {
  const [state, setState] = useState<ClaudeUsageState>(defaultState);
  const [snapEdge, setSnapEdge] = useState<SnapEdge>('top');
  const [activityHistory, setActivityHistory] = useState<ActivitySnapshot[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [theme, setThemeState] = useState<ThemeName>('dark');
  const [conversationPreview, setConversationPreview] = useState('');
  const [dailyRollups, setDailyRollups] = useState<DailyRollups>({});

  useEffect(() => {
    const cleanups = [
      window.claudePulse.onUsageUpdate((newState) => setState(newState)),
      window.claudePulse.onActivityHistory((history) => setActivityHistory(history)),
      window.claudePulse.onSnapEdge((edge) => setSnapEdge(edge)),
      window.claudePulse.onConversationPreview((msg) => setConversationPreview(msg)),
      window.claudePulse.onDailyRollups?.((r: DailyRollups) => setDailyRollups(r)),
      window.claudePulse.onThemeChange((t) => {
        setThemeState(t);
        document.documentElement.setAttribute('data-theme', t);
      }),
    ];
    window.claudePulse.requestUpdate();
    window.claudePulse.requestSnapEdge();
    window.claudePulse.requestTheme();
    return () => cleanups.forEach(cleanup => cleanup?.());
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => {
      const next = !prev;
      window.claudePulse.requestResize(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    window.claudePulse.setTheme(t);
  }, []);

  return { state, snapEdge, activityHistory, isExpanded, toggleExpanded, theme, setTheme, conversationPreview, dailyRollups };
}
