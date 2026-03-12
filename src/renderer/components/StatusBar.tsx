import React from 'react';
import { SessionIndicator } from './SessionIndicator';
import { TokenCounter } from './TokenCounter';
import { LimitBar } from './LimitBar';
import { ClaudeUsageState } from '../../shared/types';

interface StatusBarProps {
  state: ClaudeUsageState;
}

export function StatusBar({ state }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-claude-bg border border-claude-border rounded-b-lg shadow-lg h-[60px]">
      {/* Session indicator + model */}
      <SessionIndicator
        isActive={state.session.isActive}
        model={state.currentModel}
      />

      {/* Separator */}
      <div className="w-px h-6 bg-claude-border" />

      {/* Token counter */}
      <TokenCounter tokens={state.tokens} />

      {/* Separator */}
      <div className="w-px h-6 bg-claude-border" />

      {/* Limit bars */}
      <div className="flex flex-col gap-1 flex-1">
        <LimitBar label="Hour" ratio={state.limits.hourlyUsed} />
        <LimitBar label="Week" ratio={state.limits.weeklyUsed} />
      </div>
    </div>
  );
}
