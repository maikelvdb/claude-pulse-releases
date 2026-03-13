import React, { useEffect, useState } from 'react';

interface ConfettiProps {
  intensity: 'small' | 'medium' | 'large' | 'party';
  onDone: () => void;
}

const PARTICLE_COUNTS = { small: 12, medium: 24, large: 40, party: 60 };
const COLORS = ['#E87443', '#4ade80', '#60a5fa', '#f472b6', '#facc15', '#a78bfa'];

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  duration: number;
  size: number;
}

export default function Confetti({ intensity, onDone }: ConfettiProps) {
  const [particles] = useState<Particle[]>(() => {
    const count = PARTICLE_COUNTS[intensity];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.5,
      duration: 1 + Math.random() * 1.5,
      size: 3 + Math.random() * 4,
    }));
  });

  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full animate-confetti"
          style={{
            left: `${p.x}%`,
            top: '-5%',
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
