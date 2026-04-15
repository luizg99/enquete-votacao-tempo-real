'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const HIDDEN_ON = ['/vote', '/qr'];

export function Topbar() {
  const path = usePathname() ?? '';
  if (HIDDEN_ON.some((p) => path.startsWith(p))) return null;

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
      </nav>
    </header>
  );
}
