// src/renderer/components/ActivitySparkline.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { ActivitySnapshot } from '../../shared/types';

interface ActivitySparklineProps {
  history: ActivitySnapshot[];
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

const SPARKLINE_MINUTES = 5;
const SPARKLINE_MS = SPARKLINE_MINUTES * 60 * 1000;
const TICK_INTERVAL = 2000; // re-render every 2s so the chart slides with time

function bucketizeSeparate(history: ActivitySnapshot[], bucketCount: number, now: number): { input: number[]; output: number[] } {
  const cutoff = now - SPARKLINE_MS;
  const relevant = history.filter(s => s.t > cutoff);
  const bucketSize = SPARKLINE_MS / bucketCount;
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

function toPolyline(values: number[], min: number, range: number, w: number, h: number, padding: number, bucketCount: number): string {
  const stepX = w / (bucketCount - 1);
  const graphH = h - padding * 2;
  return values.map((val, i) => {
    const x = i * stepX;
    const y = padding + graphH - ((val - min) / range) * graphH;
    return `${x},${y}`;
  }).join(' ');
}

export function ActivitySparkline({ history, orientation = 'horizontal', onClick }: ActivitySparklineProps) {
  const isVertical = orientation === 'vertical';
  const w = isVertical ? 24 : 80;
  const h = isVertical ? 60 : 24;
  const bucketCount = 30;
  const padding = 2;
  const gridLines = 4;

  // Tick so the chart slides forward with time
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL);
    return () => clearInterval(id);
  }, []);

  const { inputPoints, outputPoints } = useMemo(() => {
    const { input, output } = bucketizeSeparate(history, bucketCount, now);

    // Auto-zoom across both lines so they share the same scale
    const allVals = [...input, ...output];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const range = max - min || 1;

    return {
      inputPoints: toPolyline(input, min, range, w, h, padding, bucketCount),
      outputPoints: toPolyline(output, min, range, w, h, padding, bucketCount),
    };
  }, [history, now]);

  return (
    <div
      className="cursor-pointer opacity-80 hover:opacity-100 transition-opacity no-drag"
      onClick={onClick}
      title="Click for details"
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className={isVertical ? 'rotate-90' : ''}
      >
        {/* Horizontal grid lines */}
        {Array.from({ length: gridLines }).map((_, i) => {
          const y = padding + ((h - padding * 2) / (gridLines - 1)) * i;
          return (
            <line
              key={i}
              x1={0}
              y1={y}
              x2={w}
              y2={y}
              stroke="#333346"
              strokeWidth="0.5"
            />
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
      </svg>
    </div>
  );
}
