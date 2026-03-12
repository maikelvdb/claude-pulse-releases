import React from 'react';

interface ClaudeLogoProps {
  orientation: 'horizontal' | 'vertical';
}

export function ClaudeLogo({ orientation }: ClaudeLogoProps) {
  const isVertical = orientation === 'vertical';

  return (
    <div className={`flex items-center ${isVertical ? 'flex-col gap-1' : 'gap-1.5'}`}>
      <svg
        className="w-5 h-5 text-claude-orange flex-shrink-0"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2C12 2 14.5 6.5 18 8C14.5 9.5 12 14 12 14C12 14 9.5 9.5 6 8C9.5 6.5 12 2 12 2Z" />
        <path d="M12 10C12 10 13.5 13 16 14C13.5 15 12 18 12 18C12 18 10.5 15 8 14C10.5 13 12 10 12 10Z" opacity="0.7" />
        <path d="M12 16C12 16 13 18 15 19C13 20 12 22 12 22C12 22 11 20 9 19C11 18 12 16 12 16Z" opacity="0.4" />
      </svg>
      <span className={`font-semibold text-claude-orange whitespace-nowrap ${isVertical ? 'text-[8px] [writing-mode:vertical-lr]' : 'text-[11px]'}`}>
        Claude Pulse
      </span>
    </div>
  );
}
