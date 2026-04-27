'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  startedAt: string | null;
  durationSec: number;
  size: 'large' | 'small';
  onExpiredChange?: (expired: boolean) => void;
};

export function Timer({ startedAt, durationSec, size, onExpiredChange }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [shake, setShake] = useState(false);
  const lastExpiredRef = useRef<boolean | null>(null);
  const lastStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // Reset trackers quando muda startedAt
  useEffect(() => {
    if (lastStartedAtRef.current !== startedAt) {
      lastStartedAtRef.current = startedAt;
      lastExpiredRef.current = null;
      setShake(false);
    }
  }, [startedAt]);

  const startMs = startedAt ? new Date(startedAt).getTime() : 0;
  const totalMs = durationSec * 1000;
  const remainingMs = startedAt ? Math.max(0, totalMs - (now - startMs)) : totalMs;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const expired = startedAt ? remainingMs === 0 : false;
  const pct = totalMs > 0 ? Math.max(0, remainingMs / totalMs) : 1;

  // Notifica transição de estado expirado
  useEffect(() => {
    if (lastExpiredRef.current !== expired) {
      lastExpiredRef.current = expired;
      onExpiredChange?.(expired);
      if (expired) {
        setShake(true);
        const t = setTimeout(() => setShake(false), 600);
        return () => clearTimeout(t);
      }
    }
  }, [expired, onExpiredChange]);

  if (!startedAt) {
    return (
      <div className={`timer timer-${size} timer-idle`}>
        <span className="timer-icon">⏱</span>
        <span className="timer-display">—</span>
      </div>
    );
  }

  let colorClass = 'timer-green';
  if (expired) colorClass = 'timer-expired';
  else if (pct <= 0.25) colorClass = 'timer-red';
  else if (pct <= 0.5) colorClass = 'timer-yellow';

  const criticalClass =
    !expired && remainingSec <= 5 && remainingSec > 0 ? 'timer-critical' : '';
  const shakeClass = shake ? 'timer-shake' : '';

  const mm = Math.floor(remainingSec / 60);
  const ss = remainingSec % 60;
  const display = expired
    ? 'TEMPO ESGOTADO'
    : `${mm}:${ss.toString().padStart(2, '0')}`;

  return (
    <div
      className={`timer timer-${size} ${colorClass} ${criticalClass} ${shakeClass}`}
    >
      <span className="timer-icon">⏱</span>
      <span className="timer-display">{display}</span>
    </div>
  );
}
