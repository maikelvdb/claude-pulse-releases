import React from 'react';

interface PlanBadgeProps {
  subscriptionType: string;
  orientation?: 'horizontal' | 'vertical';
}

function getPlanDisplay(sub: string): { label: string; color: string; glow: string } {
  const s = sub.toLowerCase();
  if (s.includes('max')) {
    return { label: 'MAX', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50', glow: 'shadow-[0_0_6px_rgba(245,158,11,0.3)]' };
  }
  if (s.includes('team') || s.includes('enterprise')) {
    return { label: s.includes('enterprise') ? 'ENT' : 'TEAM', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50', glow: 'shadow-[0_0_6px_rgba(59,130,246,0.3)]' };
  }
  if (s.includes('pro')) {
    return { label: 'PRO', color: 'bg-violet-500/20 text-violet-400 border-violet-500/50', glow: 'shadow-[0_0_6px_rgba(139,92,246,0.3)]' };
  }
  if (s === 'free') {
    return { label: 'FREE', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50', glow: '' };
  }
  return { label: sub.toUpperCase().slice(0, 4), color: 'bg-claude-orange/20 text-claude-orange border-claude-orange/50', glow: '' };
}

export function PlanBadge({ subscriptionType, orientation = 'horizontal' }: PlanBadgeProps) {
  if (!subscriptionType || subscriptionType === 'unknown') return null;

  const { label, color, glow } = getPlanDisplay(subscriptionType);
  const isVertical = orientation === 'vertical';

  return (
    <span
      className={`inline-flex items-center justify-center border font-bold tracking-wider rounded-md ${color} ${glow} ${
        isVertical ? 'text-[7px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5'
      }`}
    >
      {label}
    </span>
  );
}
