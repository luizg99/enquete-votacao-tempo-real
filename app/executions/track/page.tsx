'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ExecutionTrack } from '@/components/ExecutionTrack';
import { EnvGuard } from '@/components/EnvGuard';

function TrackInner() {
  const params = useSearchParams();
  const id = params.get('id');
  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <ExecutionTrack executionId={id} />;
}

export default function ExecutionTrackPage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <TrackInner />
      </Suspense>
    </EnvGuard>
  );
}
