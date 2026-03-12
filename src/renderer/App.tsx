// src/renderer/App.tsx
import React, { useState, useEffect } from 'react';
import { StatusBar } from './components/StatusBar';
import { useClaudeStats } from './hooks/useClaudeStats';
import { SnapEdge } from '../shared/types';

function getTranslateClass(edge: SnapEdge, visible: boolean): string {
  if (visible) return 'translate-x-0 translate-y-0 opacity-100';

  switch (edge) {
    case 'top': return '-translate-y-full opacity-0';
    case 'bottom': return 'translate-y-full opacity-0';
    case 'left': return '-translate-x-full opacity-0';
    case 'right': return 'translate-x-full opacity-0';
  }
}

export default function App() {
  const { state, snapEdge, activityHistory, isExpanded, toggleExpanded } = useClaudeStats();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    window.claudePulse.onVisibility?.((v: boolean) => setVisible(v));
  }, []);

  const translateClass = getTranslateClass(snapEdge, visible);

  return (
    <div className={`w-full h-full transition-all duration-300 ease-in-out ${translateClass}`}>
      <StatusBar
        state={state}
        snapEdge={snapEdge}
        activityHistory={activityHistory}
        isExpanded={isExpanded}
        onToggleExpanded={toggleExpanded}
      />
    </div>
  );
}
