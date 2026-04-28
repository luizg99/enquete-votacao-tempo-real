'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getBranding, subscribeBranding } from '@/lib/branding';

const OPERATOR_HIDDEN = ['/qr', '/executions/run'];
const CLIENT_ROUTES = ['/vote', '/join'];

export function Topbar() {
  const path = usePathname() ?? '';
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    const load = async () => {
      try {
        const b = await getBranding();
        if (active) setLogoUrl(b?.logo_url ?? null);
      } catch {
        // silencioso — Topbar não é crítico
      }
    };
    load();
    const unsub = subscribeBranding(load);
    return () => { active = false; unsub(); };
  }, []);

  if (path === '/' || path === '') return null;
  if (OPERATOR_HIDDEN.some((p) => path.startsWith(p))) return null;

  const isClientRoute = CLIENT_ROUTES.some((p) => path.startsWith(p));
  if (isClientRoute) {
    if (!logoUrl) return null;
    return (
      <header className="topbar topbar-client">
        <img src={logoUrl} alt="Logo" className="brand-logo" />
      </header>
    );
  }

  const isActive = (target: string) =>
    target === '/admin' ? path.startsWith('/admin') : path.startsWith(target);

  return (
    <header className="topbar">
      <Link href="/admin" className="brand">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="brand-logo" />
        ) : (
          <>Task<span>Question</span></>
        )}
      </Link>
      <nav>
        <Link href="/admin" className={isActive('/admin') ? 'active' : ''}>
          Cadastrar enquetes
        </Link>
        <Link href="/executions" className={isActive('/executions') ? 'active' : ''}>
          Execuções
        </Link>
      </nav>
    </header>
  );
}
