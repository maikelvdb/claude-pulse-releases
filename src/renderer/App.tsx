// src/renderer/App.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from './components/StatusBar';
import { useClaudeStats } from './hooks/useClaudeStats';
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
  const { state, snapEdge, activityHistory, isExpanded, toggleExpanded } = useClaudeStats();
  const [visible, setVisible] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

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

  // Listen for update availability
  useEffect(() => {
    const cleanup = window.claudePulse.onUpdateInfo((info) => {
      setHasUpdate(info.hasUpdate);
    });
    return cleanup;
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
        hasUpdate={hasUpdate}
        onToggleExpanded={toggleExpanded}
        onHelp={openHelp}
      />
      {quitOverlay}
    </div>
  );
}
