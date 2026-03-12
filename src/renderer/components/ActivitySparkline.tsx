// src/renderer/components/ActivitySparkline.tsx
import React, { useMemo } from 'react';
import { ActivitySnapshot } from '../../shared/types';

interface ActivitySparklineProps {
  history: ActivitySnapshot[];
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

function bucketize(history: ActivitySnapshot[], hours: number, bucketCount: number): number[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const bucketSize = (hours * 60 * 60 * 1000) / bucketCount;
  const buckets: number[] = new Array(bucketCount).fill(0);

  for (let i = 1; i < relevant.length; i++) {
    const delta = (relevant[i].input + relevant[i].output) - (relevant[i - 1].input + relevant[i - 1].output);
    if (delta <= 0) continue;
    const bucketIdx = Math.floor((relevant[i].t - cutoff) / bucketSize);
    if (bucketIdx >= 0 && bucketIdx < bucketCount) {
      buckets[bucketIdx] += delta;
    }
  }

  return buckets;
}

function activitySegments(history: ActivitySnapshot[], hours: number, segmentCount: number): boolean[] {
  const now = Date.now();
  const cutoff = now - hours * 60 * 60 * 1000;
  const relevant = history.filter(s => s.t > cutoff);
  const segmentSize = (hours * 60 * 60 * 1000) / segmentCount;
  const segments: boolean[] = new Array(segmentCount).fill(false);

  for (const snap of relevant) {
    if (!snap.active) continue;
    const idx = Math.floor((snap.t - cutoff) / segmentSize);
    if (idx >= 0 && idx < segmentCount) {
      segments[idx] = true;
    }
  }

  return segments;
}

export function ActivitySparkline({ history, orientation = 'horizontal', onClick }: ActivitySparklineProps) {
  const isVertical = orientation === 'vertical';
  const w = isVertical ? 24 : 80;
  const h = isVertical ? 60 : 24;
  const bucketCount = 24;

  const buckets = useMemo(() => bucketize(history, 12, bucketCount), [history]);
  const segments = useMemo(() => activitySegments(history, 12, bucketCount), [history]);

  const max = Math.max(...buckets, 1);
  const graphH = h - 4;
  const stepX = w / (bucketCount - 1);

  const points = buckets.map((val, i) => {
    const x = i * stepX;
    const y = graphH - (val / max) * graphH;
    return `${x},${y}`;
  }).join(' ');

  const segW = w / bucketCount;

  return (
    <div
      className="cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
      onClick={onClick}
      title="Click for details"
    >
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className={isVertical ? 'rotate-90' : ''}
      >
        <polyline
          points={points}
          fill="none"
          stroke="#E87443"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {segments.map((active, i) => (
          <rect
            key={i}
            x={i * segW}
            y={h - 3}
            width={segW - 0.5}
            height={2}
            rx={0.5}
            fill={active ? '#4ade80' : '#333346'}
          />
        ))}
      </svg>
    </div>
  );
}
