import React, { useState, useEffect } from 'react';

interface SessionTimerProps {
  sessionStartedAt: number | null;
  orientation: 'horizontal' | 'vertical';
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function SessionTimer({ sessionStartedAt, orientation }: SessionTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!sessionStartedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt]);

  if (!sessionStartedAt) return null;

  const elapsed = now - sessionStartedAt;
  const isVertical = orientation === 'vertical';

  // Night owl: show time since midnight if between 0-5 AM
  const hour = new Date().getHours();
  const isNightOwl = hour >= 0 && hour < 5;
  let nightOwlElapsed = 0;
  if (isNightOwl) {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    nightOwlElapsed = now - midnight.getTime();
  }

  return (
    <div className={`flex ${isVertical ? 'flex-col items-center' : 'items-center gap-2'} text-[9px] text-claude-text-dim`}>
      <span>{isVertical ? formatElapsed(elapsed) : `Session: ${formatElapsed(elapsed)}`}</span>
      {isNightOwl && (
        <span className="text-[8px] opacity-70">
          🌙 {isVertical ? formatElapsed(nightOwlElapsed) : `Up since midnight: ${formatElapsed(nightOwlElapsed)}`}
        </span>
      )}
    </div>
  );
}
