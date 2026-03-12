import React, { useState, useEffect } from 'react';
import { StatusBar } from './components/StatusBar';
import { useClaudeStats } from './hooks/useClaudeStats';

export default function App() {
  const state = useClaudeStats();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    window.claudePulse.onVisibility?.((v: boolean) => setVisible(v));
  }, []);

  return (
    <div
      className={`w-full transition-all duration-300 ease-in-out ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <StatusBar state={state} />
    </div>
  );
}
