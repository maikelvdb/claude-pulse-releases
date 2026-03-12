// src/renderer/components/SessionIndicator.tsx
import React from 'react';

interface SessionIndicatorProps {
  isActive: boolean;
  model: string | null;
  orientation?: 'horizontal' | 'vertical';
}

export function SessionIndicator({ isActive, model, orientation = 'horizontal' }: SessionIndicatorProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex items-center ${isVertical ? 'flex-col gap-1' : 'gap-2'}`}>
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
      <span className={`text-claude-text font-medium ${isVertical ? 'text-[8px] [writing-mode:vertical-lr]' : 'text-xs'}`}>
        {model ?? 'Idle'}
      </span>
    </div>
  );
}
