// src/renderer/components/ActivityDetail.tsx
import React, { useMemo } from 'react';
import { ActivitySnapshot } from '../../shared/types';

interface ActivityDetailProps {
  history: ActivitySnapshot[];
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface HourBucket {
  inputDelta: number;
  outputDelta: number;
  activeMinutes: number;
}

function bucketizeHourly(history: ActivitySnapshot[], hours: number): HourBucket[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const buckets: HourBucket[] = Array.from({ length: hours }, () => ({
    inputDelta: 0,
    outputDelta: 0,
    activeMinutes: 0,
  }));
  const bucketSize = 60 * 60 * 1000;

  for (let i = 1; i < relevant.length; i++) {
    const inputDelta = relevant[i].input - relevant[i - 1].input;
    const outputDelta = relevant[i].output - relevant[i - 1].output;
    const idx = Math.floor((relevant[i].t - cutoff) / bucketSize);
    if (idx >= 0 && idx < hours) {
      if (inputDelta > 0) buckets[idx].inputDelta += inputDelta;
      if (outputDelta > 0) buckets[idx].outputDelta += outputDelta;
      if (relevant[i].active) {
        const elapsed = (relevant[i].t - relevant[i - 1].t) / 60000;
        buckets[idx].activeMinutes += Math.min(elapsed, 1);
      }
    }
  }

  return buckets;
}

function activitySegments(history: ActivitySnapshot[], hours: number, count: number): boolean[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const segSize = (hours * 60 * 60 * 1000) / count;
  const segs: boolean[] = new Array(count).fill(false);

  for (const s of relevant) {
    if (!s.active) continue;
    const idx = Math.floor((s.t - cutoff) / segSize);
    if (idx >= 0 && idx < count) segs[idx] = true;
  }

  return segs;
}

export function ActivityDetail({ history, orientation = 'horizontal', onClick }: ActivityDetailProps) {
  const isVertical = orientation === 'vertical';
  const hours = 24;
  const buckets = useMemo(() => bucketizeHourly(history, hours), [history]);
  const segments = useMemo(() => activitySegments(history, hours, 48), [history]);

  const gw = isVertical ? 200 : 420;
  const gh = isVertical ? 160 : 100;
  const padL = 35;
  const padB = 16;
  const plotW = gw - padL - 4;
  const plotH = gh - padB - 4;

  const maxInput = Math.max(...buckets.map(b => b.inputDelta), 1);
  const maxOutput = Math.max(...buckets.map(b => b.outputDelta), 1);
  const maxVal = Math.max(maxInput, maxOutput);
  const stepX = plotW / (hours - 1);

  const inputPoints = buckets.map((b, i) => {
    const x = padL + i * stepX;
    const y = 4 + plotH - (b.inputDelta / maxVal) * plotH;
    return `${x},${y}`;
  }).join(' ');

  const outputPoints = buckets.map((b, i) => {
    const x = padL + i * stepX;
    const y = 4 + plotH - (b.outputDelta / maxVal) * plotH;
    return `${x},${y}`;
  }).join(' ');

  const totalInput = history.length > 0 ? history[history.length - 1].input : 0;
  const totalOutput = history.length > 0 ? history[history.length - 1].output : 0;
  const totalActiveMin = buckets.reduce((sum, b) => sum + b.activeMinutes, 0);
  const activeHours = Math.floor(totalActiveMin / 60);
  const activeMin = Math.round(totalActiveMin % 60);

  const timeLabels = [
    { pos: padL, label: '24h' },
    { pos: padL + plotW * 0.25, label: '18h' },
    { pos: padL + plotW * 0.5, label: '12h' },
    { pos: padL + plotW * 0.75, label: '6h' },
    { pos: padL + plotW, label: 'now' },
  ];

  const yLabels = [
    { pos: 4, label: formatTokens(maxVal) },
    { pos: 4 + plotH / 2, label: formatTokens(maxVal / 2) },
    { pos: 4 + plotH, label: '0' },
  ];

  const segW = plotW / 48;

  return (
    <div className="cursor-pointer px-2 pt-1 pb-2" onClick={onClick}>
      <svg width={gw} height={gh + 12} viewBox={`0 0 ${gw} ${gh + 12}`}>
        {yLabels.map((l, i) => (
          <text key={`yl-${i}`} x={padL - 4} y={l.pos + 3} textAnchor="end" fill="#888888" fontSize="8">{l.label}</text>
        ))}
        {yLabels.map((l, i) => (
          <line key={`gl-${i}`} x1={padL} y1={l.pos} x2={padL + plotW} y2={l.pos} stroke="#333346" strokeWidth="0.5" />
        ))}
        <polyline
          points={inputPoints}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={outputPoints}
          fill="none"
          stroke="#E87443"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {timeLabels.map((l, i) => (
          <text key={`tl-${i}`} x={l.pos} y={gh - 2} textAnchor="middle" fill="#888888" fontSize="8">{l.label}</text>
        ))}
        {segments.map((active, i) => (
          <rect
            key={`seg-${i}`}
            x={padL + i * segW}
            y={gh + 2}
            width={segW - 0.5}
            height={3}
            rx={0.5}
            fill={active ? '#4ade80' : '#2a2a3e'}
          />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-1 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-[#60a5fa] rounded" />
            <span className="text-[8px] text-claude-text-dim">Input</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-claude-orange rounded" />
            <span className="text-[8px] text-claude-text-dim">Output</span>
          </div>
        </div>
        <span className="text-[8px] text-claude-text-dim">
          {formatTokens(totalInput + totalOutput)} tokens &middot; {activeHours}h {activeMin}m active
        </span>
      </div>
    </div>
  );
}
