import { useRef, useCallback, useEffect, useState } from 'react';

export function useSounds() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  // Keep ref in sync with state so tone() always sees latest value
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    const unsub = window.claudePulse.onSoundMuted?.((m: boolean) => setMuted(m));
    return () => { unsub?.(); };
  }, []);

  function getCtx(): AudioContext {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }

  function tone(freq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
    if (mutedRef.current) return;
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  const playWarning = useCallback(() => {
    tone(880, 0.2, 'triangle'); // A5
  }, [muted]);

  const playUrgent = useCallback(() => {
    tone(988, 0.12, 'triangle'); // B5
    setTimeout(() => tone(988, 0.12, 'triangle'), 150);
  }, [muted]);

  const playSparkle = useCallback(() => {
    tone(1047, 0.1, 'sine', 0.1); // C6
    setTimeout(() => tone(1319, 0.1, 'sine', 0.1), 80); // E6
    setTimeout(() => tone(1568, 0.15, 'sine', 0.08), 160); // G6
  }, [muted]);

  const playCelebration = useCallback(() => {
    tone(523, 0.1); // C5
    setTimeout(() => tone(659, 0.1), 100); // E5
    setTimeout(() => tone(784, 0.1), 200); // G5
    setTimeout(() => tone(1047, 0.2), 300); // C6
  }, [muted]);

  return { playWarning, playUrgent, playSparkle, playCelebration, muted };
}
