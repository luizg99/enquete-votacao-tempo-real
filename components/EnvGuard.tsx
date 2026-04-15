'use client';

import { isSupabaseConfigured } from '@/lib/supabase';

export function EnvGuard({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="env-warning">
        <h3>⚠ Supabase não configurado</h3>
        <p>
          Defina as variáveis <code>NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>:
        </p>
        <ul>
          <li>Local: crie <code>.env.local</code> na raiz (veja <code>.env.example</code>).</li>
          <li>Produção: adicione como GitHub Secrets (Settings → Secrets and variables → Actions) — o workflow já repassa.</li>
        </ul>
      </div>
    );
  }
  return <>{children}</>;
}
