// src/renderer/App.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from './components/StatusBar';
import { useClaudeStats } from './hooks/useClaudeStats';
import { useSounds } from './hooks/useSounds';
import Confetti from './components/Confetti';
import { SnapEdge } from '../shared/types';

function getTranslateClass(edge: SnapEdge, visible: boolean): string {
  if (visible) return 'translate-x-0 translate-y-0';

  switch (edge) {
    case 'top': return '-translate-y-full';
    case 'bottom': return 'translate-y-full';
    case 'left': return '-translate-x-full';
    case 'right': return 'translate-x-full';
  }
}

function getThinBarClasses(edge: SnapEdge): string {
  switch (edge) {
    case 'top': return 'top-0 left-1/2 -translate-x-1/2 w-48 h-1 cursor-pointer rounded-b';
    case 'bottom': return 'bottom-0 left-1/2 -translate-x-1/2 w-48 h-1 cursor-pointer rounded-t';
    case 'left': return 'left-0 top-1/2 -translate-y-1/2 w-1 h-48 cursor-pointer rounded-r';
    case 'right': return 'right-0 top-1/2 -translate-y-1/2 w-1 h-48 cursor-pointer rounded-l';
  }
}

function QuitConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-claude-bg border border-claude-border rounded-xl shadow-2xl px-6 py-5 flex flex-col items-center gap-4 min-w-[240px]">
        <p className="text-claude-text text-sm font-medium">Quit Claude Pulse?</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded-md text-xs bg-claude-border/40 text-claude-text-dim hover:bg-claude-border transition-colors cursor-pointer no-drag"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 rounded-md text-xs bg-claude-orange text-white hover:bg-claude-orange/80 transition-colors cursor-pointer no-drag font-medium"
          >
            Quit
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { state, snapEdge, activityHistory, isExpanded, toggleExpanded, conversationPreview, dailyRollups, rcSessions } = useClaudeStats();
  const [visible, setVisible] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [confetti, setConfetti] = useState<'small' | 'medium' | 'large' | 'party' | null>(null);
  const { playWarning, playUrgent, playSparkle, playCelebration } = useSounds();
  const reachedTiers = useRef<Set<number>>(new Set());
  const prevHourlyUsed = useRef(0);
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  const toggleMinimized = useCallback(() => {
    setMinimized(prev => !prev);
  }, []);

  const openHelp = useCallback(() => {
    window.claudePulse.openHelp();
  }, []);

  useEffect(() => {
    const cleanup = window.claudePulse.onVisibility((v: boolean) => setVisible(v));
    return cleanup;
  }, []);

  // Auto-compact after hover out, expand on hover in
  useEffect(() => {
    const isHorizontal = snapEdge === 'top' || snapEdge === 'bottom';
    if (!isHorizontal) {
      setIsCompact(false);
      window.claudePulse.setCompact(false);
      return;
    }

    const goCompact = () => {
      setIsCompact(true);
      window.claudePulse.setCompact(true);
    };

    const goFull = () => {
      setIsCompact(false);
      window.claudePulse.setCompact(false);
    };

    const cleanup = window.claudePulse.onHover((hovered: boolean) => {
      if (hovered) {
        if (compactTimerRef.current) {
          clearTimeout(compactTimerRef.current);
          compactTimerRef.current = null;
        }
        // Delay expand by 2 seconds — only enlarge if still hovered
        if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
        expandTimerRef.current = setTimeout(() => {
          goFull();
          expandTimerRef.current = null;
        }, 2000);
      } else {
        // Left the widget — cancel pending expand
        if (expandTimerRef.current) {
          clearTimeout(expandTimerRef.current);
          expandTimerRef.current = null;
        }
        if (!isExpandedRef.current) {
          if (compactTimerRef.current) clearTimeout(compactTimerRef.current);
          compactTimerRef.current = setTimeout(() => {
            goCompact();
            compactTimerRef.current = null;
          }, 3000);
        }
      }
    });

    // Start compact timer on mount
    compactTimerRef.current = setTimeout(() => {
      goCompact();
      compactTimerRef.current = null;
    }, 3000);

    return () => {
      cleanup();
      if (compactTimerRef.current) {
        clearTimeout(compactTimerRef.current);
        compactTimerRef.current = null;
      }
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }
    };
  }, [snapEdge]);

  // Global shortcut: Ctrl+Shift+P to toggle (registered in main process)
  useEffect(() => {
    const cleanup = window.claudePulse.onToggleMinimize(() => {
      toggleMinimized();
    });
    return cleanup;
  }, [toggleMinimized]);

  // Global shortcut: Ctrl+Shift+Q to quit (with confirm)
  useEffect(() => {
    const cleanup = window.claudePulse.onConfirmQuit(() => {
      setShowQuitConfirm(true);
    });
    return cleanup;
  }, []);

  // Global shortcut: Ctrl+Shift+M to cycle size (compact → full → expanded)
  useEffect(() => {
    const cleanup = window.claudePulse.onCycleSize(() => {
      if (isCompact) {
        // compact → full
        setIsCompact(false);
        window.claudePulse.setCompact(false);
      } else if (!isExpanded) {
        // full → expanded
        toggleExpanded();
      } else {
        // expanded → compact
        toggleExpanded(); // collapse first
        setTimeout(() => {
          setIsCompact(true);
          window.claudePulse.setCompact(true);
        }, 50);
      }
    });
    return cleanup;
  }, [isCompact, isExpanded, toggleExpanded]);

  // Listen for update availability
  useEffect(() => {
    const cleanup = window.claudePulse.onUpdateInfo((info) => {
      setHasUpdate(info.hasUpdate);
    });
    return cleanup;
  }, []);

  // Load milestone map and already-unlocked achievements on mount
  const milestoneMapRef = useRef<Record<number, string>>({});
  useEffect(() => {
    window.claudePulse.getMilestoneMap().then((map) => {
      milestoneMapRef.current = map;
    });
    window.claudePulse.getAchievements().then((achievements) => {
      for (const a of achievements) {
        if (a.unlockedAt) {
          // Find the threshold for this achievement and mark as reached
          const threshold = Object.entries(milestoneMapRef.current)
            .find(([, id]) => id === a.id);
          if (threshold) reachedTiers.current.add(Number(threshold[0]));
        }
      }
    });
  }, []);

  // Milestone detection
  useEffect(() => {
    const total = state.tokens.inputToday + state.tokens.outputToday;
    const tiers: [number, 'small' | 'medium' | 'large' | 'party'][] = [
      [500_000, 'small'], [1_000_000, 'medium'], [5_000_000, 'large'], [10_000_000, 'party'],
    ];
    for (const [threshold, intensity] of tiers) {
      if (total >= threshold && !reachedTiers.current.has(threshold)) {
        reachedTiers.current.add(threshold);
        const achievementId = milestoneMapRef.current[threshold];
        if (achievementId) {
          window.claudePulse.unlockAchievement(achievementId).then((isNew) => {
            if (isNew) {
              setConfetti(intensity);
              if (intensity === 'small') playSparkle();
              else playCelebration();
            }
          });
        }
      }
    }
  }, [state.tokens]);

  // Rate limit sound effect
  useEffect(() => {
    const h = state.limits.hourlyUsed;
    if (h >= 0.9 && prevHourlyUsed.current < 0.9) playUrgent();
    else if (h >= 0.8 && prevHourlyUsed.current < 0.8) playWarning();
    prevHourlyUsed.current = h;
  }, [state.limits.hourlyUsed]);

  // Night owl auto-detection
  useEffect(() => {
    const check = () => {
      const h = new Date().getHours();
      const isNight = h >= 0 && h < 5;
      if (isNight) document.documentElement.setAttribute('data-nightowl', 'true');
      else document.documentElement.removeAttribute('data-nightowl');
    };
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  // Konami code: ↑↑↓↓←→←→BA
  const konamiRef = useRef<string[]>([]);
  const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      konamiRef.current.push(e.key);
      konamiRef.current = konamiRef.current.slice(-10);
      if (konamiRef.current.join(',') === KONAMI.join(',')) {
        document.documentElement.setAttribute('data-rainbow', 'true');
        setTimeout(() => document.documentElement.removeAttribute('data-rainbow'), 10000);
        konamiRef.current = [];
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const translateClass = getTranslateClass(snapEdge, visible);

  const quitOverlay = showQuitConfirm ? (
    <QuitConfirm
      onConfirm={() => window.claudePulse.quit()}
      onCancel={() => setShowQuitConfirm(false)}
    />
  ) : null;

  if (minimized) {
    return (
      <div className="w-full h-full relative">
        <div
          className={`absolute ${getThinBarClasses(snapEdge)} bg-claude-orange hover:bg-claude-orange transition-colors duration-200 no-drag`}
          onClick={toggleMinimized}
        />
        {quitOverlay}
      </div>
    );
  }

  return (
    <div className={`w-full h-full transition-all duration-300 ease-in-out ${translateClass}`}>
      <StatusBar
        state={state}
        snapEdge={snapEdge}
        activityHistory={activityHistory}
        isExpanded={isExpanded}
        isCompact={isCompact}
        hasUpdate={hasUpdate}
        conversationPreview={conversationPreview}
        dailyRollups={dailyRollups}
        rcCount={rcSessions.length}
        onRcClick={() => window.claudePulse.openHelp('rc')}
        confetti={confetti}
        onConfettiDone={() => setConfetti(null)}
        onToggleExpanded={toggleExpanded}
        onHelp={openHelp}
      />
      {quitOverlay}
    </div>
  );
}
