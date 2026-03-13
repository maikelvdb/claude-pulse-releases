import React from 'react';
import { DailyRollups } from '../../shared/types';

interface MiniHeatmapProps {
  rollups: DailyRollups;
  orientation: 'horizontal' | 'vertical';
  onClickHistory?: () => void;
}

function getIntensity(total: number, max: number): string {
  if (total === 0 || max === 0) return 'opacity-10';
  const ratio = total / max;
  if (ratio < 0.2) return 'opacity-20';
  if (ratio < 0.4) return 'opacity-40';
  if (ratio < 0.7) return 'opacity-70';
  return 'opacity-100';
}

export default function MiniHeatmap({ rollups, orientation, onClickHistory }: MiniHeatmapProps) {
  const days: { date: string; total: number }[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const r = rollups[key];
    days.push({ date: key, total: r ? r.input + r.output : 0 });
  }
  const max = Math.max(...days.map(d => d.total), 1);
  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`flex ${isVertical ? 'flex-col' : 'flex-row'} gap-[2px] cursor-pointer no-drag`}
      onClick={onClickHistory}
      title="Click for full history"
    >
      {days.map(d => (
        <div
          key={d.date}
          className={`w-3 h-3 rounded-[2px] bg-claude-orange ${getIntensity(d.total, max)}`}
          title={`${d.date}: ${d.total > 0 ? (d.total / 1000).toFixed(0) + 'K tokens' : 'no usage'}`}
        />
      ))}
    </div>
  );
}
