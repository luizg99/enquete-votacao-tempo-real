'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { getSurvey } from '@/lib/store';
import type { Survey } from '@/lib/types';

export function QrScreen({ surveyId }: { surveyId: string }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const router = useRouter();

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}${basePath}/vote/?id=${surveyId}`
      : '';

  useEffect(() => {
    (async () => {
      const s = await getSurvey(surveyId);
      setSurvey(s);
      setLoading(false);
    })();
  }, [surveyId]);

  useEffect(() => {
    if (!canvasRef.current || !url || !survey) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 320, margin: 1 }, (err) => {
      if (err) console.error(err);
    });
  }, [url, survey]);

  if (loading) return <div className="card">Carregando…</div>;
  if (!survey) return <div className="empty">Enquete não encontrada.</div>;

  return (
    <div className="qr-fullscreen">
      <button className="btn close" onClick={() => router.push('/dashboard')}>
        ✕ Fechar
      </button>
      <h2>{survey.title || 'Enquete'}</h2>
      <canvas ref={canvasRef} />
      <div className="url-label">{url}</div>
      <p className="muted" style={{ marginTop: 8 }}>
        Aponte a câmera do celular para votar
      </p>
    </div>
  );
}
