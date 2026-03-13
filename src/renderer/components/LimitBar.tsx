import React from 'react';

interface LimitBarProps {
  label: string;
  ratio: number; // 0-1
  orientation?: 'horizontal' | 'vertical';
  tooltip?: string;
}

export function LimitBar({ label, ratio, orientation = 'horizontal', tooltip }: LimitBarProps) {
  const percentage = Math.min(Math.round(ratio * 100), 100);
  const isWarning = ratio > 0.8;
  const isCritical = ratio > 0.95;

  const barColor = isCritical
    ? 'bg-red-500'
    : isWarning
    ? 'bg-yellow-500'
    : 'bg-claude-orange';

  if (orientation === 'vertical') {
    return (
      <div className="flex flex-col items-center gap-0.5 h-[50px]" title={tooltip}>
        <span className="text-[8px] text-claude-text-dim uppercase">{label}</span>
        <div className="w-2 flex-1 bg-claude-bar-bg rounded-full overflow-hidden flex flex-col-reverse">
          <div
            className={`w-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ height: `${percentage}%` }}
          />
        </div>
        <span className="text-[7px] text-claude-text-dim">{percentage}%</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]" title={tooltip}>
      <span className="text-[10px] text-claude-text-dim uppercase tracking-wider w-8">
        {label}
      </span>
      <div className="flex-1 h-2 bg-claude-bar-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] text-claude-text-dim w-8 text-right">
        {percentage}%
      </span>
    </div>
  );
}
