'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getBranding, subscribeBranding } from '@/lib/branding';

const HIDDEN_ON = ['/vote', '/qr', '/join', '/executions/run'];

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

  if (HIDDEN_ON.some((p) => path.startsWith(p))) return null;

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
          Admin
        </Link>
        <Link href="/executions" className={isActive('/executions') ? 'active' : ''}>
          Execuções
        </Link>
      </nav>
    </header>
  );
}
