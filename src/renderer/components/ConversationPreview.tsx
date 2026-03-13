import React from 'react';

interface ConversationPreviewProps {
  text: string;
  orientation: 'horizontal' | 'vertical';
}

export function ConversationPreview({ text, orientation }: ConversationPreviewProps) {
  if (!text) return null;

  if (orientation === 'vertical') {
    return (
      <div className="w-full px-1 overflow-hidden">
        <p className="text-[9px] text-claude-text-dim leading-tight line-clamp-3 break-words">
          {text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 overflow-hidden">
      <div className="overflow-hidden whitespace-nowrap">
        <p key={text} className="text-[10px] text-claude-text-dim inline-block animate-marquee">
          {text}
        </p>
      </div>
    </div>
  );
}
