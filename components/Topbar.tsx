'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Topbar() {
  const path = usePathname() ?? '';
  const isActive = (target: string) => path.startsWith(target);

  return (
    <header className="topbar">
      <Link href="/admin" className="brand">
        Task<span>Question</span>
      </Link>
      <nav>
        <Link href="/admin" className={isActive('/admin') ? 'active' : ''}>
          Admin
        </Link>
        <Link href="/dashboard" className={isActive('/dashboard') ? 'active' : ''}>
          Dashboard
        </Link>
      </nav>
    </header>
  );
}
