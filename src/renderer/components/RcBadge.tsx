import React, { useEffect, useRef, useState } from 'react';

interface RcBadgeProps {
  count: number;
  orientation?: 'horizontal' | 'vertical';
  onClick: () => void;
}

export function RcBadge({ count, orientation = 'horizontal', onClick }: RcBadgeProps) {
  const prevCountRef = useRef(count);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (count > prevCountRef.current) {
      setIsNew(true);
      const timer = setTimeout(() => setIsNew(false), 5000);
      prevCountRef.current = count;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = count;
  }, [count]);

  if (count === 0) return null;

  const isVertical = orientation === 'vertical';
  const baseColor = 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50';
  const glow = isNew
    ? 'shadow-[0_0_8px_rgba(6,182,212,0.5)] animate-pulse'
    : 'shadow-[0_0_4px_rgba(6,182,212,0.2)]';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  return (
    <button
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center gap-0.5 border font-bold tracking-wider rounded-md cursor-pointer ${baseColor} ${glow} ${
        isVertical ? 'text-[7px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5'
      }`}
      title={`${count} remote control session${count === 1 ? '' : 's'} active`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isVertical ? 'w-2 h-2' : 'w-2.5 h-2.5'}
      >
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
        <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
        <circle cx="12" cy="12" r="2" />
      </svg>
      {count}
      {isNew && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
      )}
    </button>
  );
}
