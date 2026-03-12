import React from 'react';

interface LimitBarProps {
  label: string;
  ratio: number; // 0-1
}

export function LimitBar({ label, ratio }: LimitBarProps) {
  const percentage = Math.min(Math.round(ratio * 100), 100);
  const isWarning = ratio > 0.8;
  const isCritical = ratio > 0.95;

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]">
      <span className="text-[10px] text-claude-text-dim uppercase tracking-wider w-8">
        {label}
      </span>
      <div className="flex-1 h-2 bg-claude-bar-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isCritical
              ? 'bg-red-500'
              : isWarning
              ? 'bg-yellow-500'
              : 'bg-claude-orange'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] text-claude-text-dim w-8 text-right">
        {percentage}%
      </span>
    </div>
  );
}
