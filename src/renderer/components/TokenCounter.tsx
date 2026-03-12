// src/renderer/components/TokenCounter.tsx
import React from 'react';
import { TokenUsage } from '../../shared/types';

interface TokenCounterProps {
  tokens: TokenUsage;
  orientation?: 'horizontal' | 'vertical';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function TokenCounter({ tokens, orientation = 'horizontal' }: TokenCounterProps) {
  const total = tokens.inputToday + tokens.outputToday;
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex items-center ${isVertical ? 'flex-col gap-0.5' : 'gap-1'}`}>
      <svg className="w-3 h-3 text-claude-orange flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2.5a1 1 0 011 1v3.25l2.1 1.25a1 1 0 01-1 1.73L7.5 8.75V4.5a1 1 0 011-1z" />
      </svg>
      <span className={`text-claude-text font-mono ${isVertical ? 'text-[9px]' : 'text-xs'}`}>
        {formatTokens(total)}
      </span>
      {!isVertical && <span className="text-[10px] text-claude-text-dim">tokens</span>}
    </div>
  );
}
