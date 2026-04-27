'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { RankingScreen } from '@/components/RankingScreen';
import { EnvGuard } from '@/components/EnvGuard';

function RankingInner() {
  const params = useSearchParams();
  const id = params.get('id');
  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <RankingScreen executionId={id} />;
}

export default function RankingPage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <RankingInner />
      </Suspense>
    </EnvGuard>
  );
}
