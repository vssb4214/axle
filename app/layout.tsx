import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Axle - Honest car trading valuations',
  description: 'Peer-to-peer car trading and selling with honest, comps-based valuations powered by local AI.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-950 text-slate-50`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

