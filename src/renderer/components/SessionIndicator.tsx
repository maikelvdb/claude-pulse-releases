import React from 'react';

interface SessionIndicatorProps {
  isActive: boolean;
  model: string | null;
}

export function SessionIndicator({ isActive, model }: SessionIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            isActive ? 'bg-claude-active' : 'bg-claude-idle'
          }`}
        />
        {isActive && (
          <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-claude-active animate-ping opacity-40" />
        )}
      </div>
      <span className="text-xs text-claude-text font-medium">
        {model ?? 'Idle'}
      </span>
    </div>
  );
}
