'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TrackDashboard } from '@/components/TrackDashboard';
import { EnvGuard } from '@/components/EnvGuard';

function TrackInner() {
  const params = useSearchParams();
  const id = params.get('id');

  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <TrackDashboard surveyId={id} />;
}

export default function TrackPage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <TrackInner />
      </Suspense>
    </EnvGuard>
  );
}
