import Link from 'next/link';
import { ReactNode } from 'react';
import { Suspense } from 'react';
import { UserMenu } from './UserMenu';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-brand/80" />
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Axle</span>
              <span className="text-xs text-slate-400">Honest car trades</span>
            </div>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-slate-300">
            <Link href="/evaluate" className="hover:text-white">
              Evaluate
            </Link>
            <Link href="/browse" className="hover:text-white">
              Browse
            </Link>
            <Link href="/dashboard" className="hover:text-white">
              Dashboard
            </Link>
            <Link href="/offers" className="hover:text-white">
              Offers
            </Link>
            <Link href="/messages" className="hover:text-white">
              Messages
            </Link>
            <Link href="/watchlists" className="hover:text-white">
              Watchlists
            </Link>
            <Suspense>
              <UserMenu />
            </Suspense>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Axle. Built for fair, enthusiast-friendly trades.
      </footer>
    </div>
  );
}

