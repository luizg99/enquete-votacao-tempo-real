'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { QrScreen } from '@/components/QrScreen';
import { EnvGuard } from '@/components/EnvGuard';

function QrInner() {
  const params = useSearchParams();
  const id = params.get('id');

  if (!id) {
    return <div className="empty">URL inválida: faltando parâmetro <code>?id=</code>.</div>;
  }
  return <QrScreen surveyId={id} />;
}

export default function QrPage() {
  return (
    <EnvGuard>
      <Suspense fallback={<div className="card">Carregando…</div>}>
        <QrInner />
      </Suspense>
    </EnvGuard>
  );
}
