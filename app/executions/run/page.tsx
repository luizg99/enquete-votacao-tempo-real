'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { RunPanel } from '@/components/RunPanel';
import { EnvGuard } from '@/components/EnvGuard';

function RunInner() {
  const params = useSearchParams();
  const id = params.get('id');
  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <RunPanel executionId={id} />;
}

export default function ExecutionRunPage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <RunInner />
      </Suspense>
    </EnvGuard>
  );
}
