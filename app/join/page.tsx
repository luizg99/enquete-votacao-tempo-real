'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { JoinFlow } from '@/components/JoinFlow';
import { EnvGuard } from '@/components/EnvGuard';

function JoinInner() {
  const params = useSearchParams();
  const id = params.get('id');
  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <JoinFlow executionId={id} />;
}

export default function JoinPage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <JoinInner />
      </Suspense>
    </EnvGuard>
  );
}
