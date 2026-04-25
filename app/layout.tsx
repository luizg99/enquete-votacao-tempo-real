import type { Metadata } from 'next';
import './globals.css';
import { Topbar } from '@/components/Topbar';

export const metadata: Metadata = {
  title: 'Task Question',
  description: 'Enquetes e votações em tempo real',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br" translate="no" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="notranslate" translate="no" suppressHydrationWarning>
        <Topbar />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
