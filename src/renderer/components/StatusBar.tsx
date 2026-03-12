// src/renderer/components/StatusBar.tsx
import React from 'react';
import { ClaudeLogo } from './ClaudeLogo';
import { SessionIndicator } from './SessionIndicator';
import { TokenCounter } from './TokenCounter';
import { LimitBar } from './LimitBar';
import { ActivitySparkline } from './ActivitySparkline';
import { ActivityDetail } from './ActivityDetail';
import { ClaudeUsageState, SnapEdge, ActivitySnapshot } from '../../shared/types';

interface StatusBarProps {
  state: ClaudeUsageState;
  snapEdge: SnapEdge;
  activityHistory: ActivitySnapshot[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

function getBorderRadius(edge: SnapEdge): string {
  switch (edge) {
    case 'top': return 'rounded-b-lg';
    case 'bottom': return 'rounded-t-lg';
    case 'left': return 'rounded-r-lg';
    case 'right': return 'rounded-l-lg';
  }
}

export function StatusBar({ state, snapEdge, activityHistory, isExpanded, onToggleExpanded }: StatusBarProps) {
  const isVertical = snapEdge === 'left' || snapEdge === 'right';
  const orientation = isVertical ? 'vertical' : 'horizontal';
  const radius = getBorderRadius(snapEdge);

  if (isVertical) {
    return (
      <div className={`flex flex-col items-center gap-2 px-2 py-3 bg-claude-bg border border-claude-border ${radius} shadow-lg ${isExpanded ? 'w-[260px]' : 'w-[80px]'} transition-all duration-300`}>
        <div className={`flex ${isExpanded ? 'flex-row items-start gap-3 w-full' : 'flex-col items-center gap-2'}`}>
          <div className="flex flex-col items-center gap-2">
            <ClaudeLogo orientation="vertical" />
            <div className="h-px w-8 bg-claude-border" />
            <SessionIndicator isActive={state.session.isActive} model={state.currentModel} orientation="vertical" />
            <div className="h-px w-8 bg-claude-border" />
            <TokenCounter tokens={state.tokens} orientation="vertical" />
            <div className="h-px w-8 bg-claude-border" />
            <ActivitySparkline history={activityHistory} orientation="vertical" onClick={onToggleExpanded} />
            <div className="h-px w-8 bg-claude-border" />
            <div className="flex gap-2">
              <LimitBar label="H" ratio={state.limits.hourlyUsed} orientation="vertical" />
              <LimitBar label="W" ratio={state.limits.weeklyUsed} orientation="vertical" />
            </div>
          </div>
          {isExpanded && (
            <div className="flex-1">
              <ActivityDetail history={activityHistory} orientation="vertical" onClick={onToggleExpanded} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-claude-bg border border-claude-border ${radius} shadow-lg ${isExpanded ? 'h-[200px]' : 'h-[60px]'} transition-all duration-300`}>
      <div className="flex items-center gap-3 px-4 py-2 h-[60px] shrink-0">
        <ClaudeLogo orientation="horizontal" />
        <div className="w-px h-6 bg-claude-border" />
        <SessionIndicator isActive={state.session.isActive} model={state.currentModel} orientation="horizontal" />
        <div className="w-px h-6 bg-claude-border" />
        <TokenCounter tokens={state.tokens} orientation="horizontal" />
        <div className="w-px h-6 bg-claude-border" />
        <ActivitySparkline history={activityHistory} orientation="horizontal" onClick={onToggleExpanded} />
        <div className="w-px h-6 bg-claude-border" />
        <div className="flex flex-col gap-1 flex-1">
          <LimitBar label="Hour" ratio={state.limits.hourlyUsed} orientation="horizontal" />
          <LimitBar label="Week" ratio={state.limits.weeklyUsed} orientation="horizontal" />
        </div>
      </div>
      {isExpanded && (
        <div className="flex-1 border-t border-claude-border overflow-hidden">
          <ActivityDetail history={activityHistory} orientation="horizontal" onClick={onToggleExpanded} />
        </div>
      )}
    </div>
  );
}
