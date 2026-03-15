import React from 'react';
import { useResetCountdown } from './ResetCountdown';

interface LimitBarProps {
  label: string;
  ratio: number; // 0-1
  orientation?: 'horizontal' | 'vertical';
  tooltip?: string;
  resetTime?: string | null;
}

export function LimitBar({ label, ratio, orientation = 'horizontal', tooltip, resetTime }: LimitBarProps) {
  const percentage = Math.min(Math.round(ratio * 100), 100);
  const isWarning = ratio > 0.8;
  const isCritical = ratio > 0.95;
  const countdown = useResetCountdown(resetTime ?? null);

  // Flash on value change
  const [flash, setFlash] = React.useState(false);
  const prevRatio = React.useRef(ratio);
  React.useEffect(() => {
    if (prevRatio.current !== ratio && prevRatio.current !== 0) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      prevRatio.current = ratio;
      return () => clearTimeout(t);
    }
    prevRatio.current = ratio;
  }, [ratio]);

  const barColor = isCritical
    ? 'bg-red-500'
    : isWarning
    ? 'bg-yellow-500'
    : 'bg-claude-orange';

  const flashGlow = flash ? (isCritical ? 'shadow-[0_0_8px_rgba(239,68,68,0.6)]' : isWarning ? 'shadow-[0_0_8px_rgba(234,179,8,0.6)]' : 'shadow-[0_0_8px_rgba(227,119,51,0.6)]') : '';

  if (orientation === 'vertical') {
    return (
      <div className="flex flex-col items-center gap-0.5 h-[50px]" title={tooltip}>
        <span className="text-[8px] text-claude-text-dim uppercase">{label}</span>
        <div className={`w-2 flex-1 bg-claude-bar-bg rounded-full overflow-hidden flex flex-col-reverse transition-shadow duration-300 ${flashGlow}`}>
          <div
            className={`w-full rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{ height: `${percentage}%` }}
          />
        </div>
        <span className={`text-[7px] transition-colors duration-300 ${flash ? 'text-claude-text' : 'text-claude-text-dim'}`}>
          {countdown ?? `${percentage}%`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-[100px]" title={tooltip}>
      <span className="text-[10px] text-claude-text-dim uppercase tracking-wider w-8">
        {label}
      </span>
      <div className={`flex-1 h-2 bg-claude-bar-bg rounded-full overflow-hidden transition-shadow duration-300 ${flashGlow}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-[10px] w-12 text-right whitespace-nowrap transition-colors duration-300 ${flash ? 'text-claude-text' : 'text-claude-text-dim'}`}>
        {countdown ? `${percentage}% · ${countdown}` : `${percentage}%`}
      </span>
    </div>
  );
}
