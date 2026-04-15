'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { VoteStepper } from '@/components/VoteStepper';
import { EnvGuard } from '@/components/EnvGuard';

function VoteInner() {
  const params = useSearchParams();
  const id = params.get('id');

  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <VoteStepper surveyId={id} />;
}

export default function VotePage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <VoteInner />
      </Suspense>
    </EnvGuard>
  );
}
