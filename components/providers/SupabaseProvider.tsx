'use client';

import { ReactNode } from 'react';

/**
 * Optional wrapper for Supabase session context.
 * Currently a passthrough; add @supabase/ssr or session provider when needed.
 */
export function SupabaseProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
