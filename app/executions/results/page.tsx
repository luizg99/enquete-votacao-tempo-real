'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ResultsScreen } from '@/components/ResultsScreen';
import { EnvGuard } from '@/components/EnvGuard';

function ResultsInner() {
  const params = useSearchParams();
  const id = params.get('id');
  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <ResultsScreen executionId={id} />;
}

export default function ResultsPage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <ResultsInner />
      </Suspense>
    </EnvGuard>
  );
}
