// src/renderer/components/ActivityDetail.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { ActivitySnapshot } from '../../shared/types';
import { formatTokens } from '../utils/format';

interface ActivityDetailProps {
  history: ActivitySnapshot[];
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

const DETAIL_MINUTES = 60;
const DETAIL_MS = DETAIL_MINUTES * 60 * 1000;
const TICK_INTERVAL = 2000;

function bucketizeSeparate(history: ActivitySnapshot[], bucketCount: number, now: number): { input: number[]; output: number[] } {
  const cutoff = now - DETAIL_MS;
  const relevant = history.filter(s => s.t > cutoff);
  const bucketSize = DETAIL_MS / bucketCount;
  const input: number[] = new Array(bucketCount).fill(0);
  const output: number[] = new Array(bucketCount).fill(0);

  for (let i = 1; i < relevant.length; i++) {
    const dIn = relevant[i].input - relevant[i - 1].input;
    const dOut = relevant[i].output - relevant[i - 1].output;
    const idx = Math.floor((relevant[i].t - cutoff) / bucketSize);
    if (idx >= 0 && idx < bucketCount) {
      if (dIn > 0) input[idx] += dIn;
      if (dOut > 0) output[idx] += dOut;
    }
  }

  return { input, output };
}

function toPolyline(values: number[], min: number, range: number, plotW: number, plotH: number, padL: number, padT: number, bucketCount: number): string {
  const stepX = plotW / (bucketCount - 1);
  return values.map((val, i) => {
    const x = padL + i * stepX;
    const y = padT + plotH - ((val - min) / range) * plotH;
    return `${x},${y}`;
  }).join(' ');
}

export function ActivityDetail({ history, orientation = 'horizontal', onClick }: ActivityDetailProps) {
  const isVertical = orientation === 'vertical';
  const bucketCount = 60; // one bucket per minute

  const gw = isVertical ? 200 : 420;
  const gh = isVertical ? 160 : 100;
  const padL = 35;
  const padT = 4;
  const padB = 16;
  const plotW = gw - padL - 4;
  const plotH = gh - padB - padT;
  const gridLines = 5;

  // Tick so the chart slides forward with time
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const { inputPoints, outputPoints, maxVal } = useMemo(() => {
    const { input, output } = bucketizeSeparate(history, bucketCount, now);

    const allVals = [...input, ...output];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const range = max - min || 1;

    return {
      inputPoints: toPolyline(input, min, range, plotW, plotH, padL, padT, bucketCount),
      outputPoints: toPolyline(output, min, range, plotW, plotH, padL, padT, bucketCount),
      maxVal: max,
    };
  }, [history, now]);

  const totalInput = history.length > 0 ? history[history.length - 1].input : 0;
  const totalOutput = history.length > 0 ? history[history.length - 1].output : 0;

  const timeLabels = [
    { pos: padL, label: '60m' },
    { pos: padL + plotW * 0.25, label: '45m' },
    { pos: padL + plotW * 0.5, label: '30m' },
    { pos: padL + plotW * 0.75, label: '15m' },
    { pos: padL + plotW, label: 'now' },
  ];

  const yLabels = [
    { pos: padT, label: formatTokens(maxVal) },
    { pos: padT + plotH / 2, label: formatTokens(maxVal / 2) },
    { pos: padT + plotH, label: '0' },
  ];

  return (
    <div className="cursor-pointer px-2 pt-1 pb-2 no-drag" onClick={onClick}>
      <svg width={gw} height={gh} viewBox={`0 0 ${gw} ${gh}`}>
        {/* Y-axis labels */}
        {yLabels.map((l, i) => (
          <text key={`yl-${i}`} x={padL - 4} y={l.pos + 3} textAnchor="end" fill="#888888" fontSize="8">{l.label}</text>
        ))}
        {/* Horizontal grid lines */}
        {Array.from({ length: gridLines }).map((_, i) => {
          const y = padT + (plotH / (gridLines - 1)) * i;
          return (
            <line key={`gl-${i}`} x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="#333346" strokeWidth="0.5" />
          );
        })}
        {/* Input tokens line (orange) */}
        <polyline
          points={inputPoints}
          fill="none"
          stroke="#E87443"
          strokeWidth="1.5"
          strokeLinejoin="miter"
        />
        {/* Output tokens line (green) */}
        <polyline
          points={outputPoints}
          fill="none"
          stroke="#84a84e"
          strokeWidth="1.5"
          strokeLinejoin="miter"
        />
        {/* Time labels */}
        {timeLabels.map((l, i) => (
          <text key={`tl-${i}`} x={l.pos} y={gh - 2} textAnchor="middle" fill="#888888" fontSize="8">{l.label}</text>
        ))}
      </svg>
      <div className="flex items-center justify-between mt-1 px-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-claude-orange rounded" />
            <span className="text-[8px] text-claude-text-dim">Input</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-0.5 bg-[#84a84e] rounded" />
            <span className="text-[8px] text-claude-text-dim">Output</span>
          </div>
        </div>
        <span className="text-[8px] text-claude-text-dim">
          {formatTokens(totalInput + totalOutput)} tokens
        </span>
      </div>
    </div>
  );
}
