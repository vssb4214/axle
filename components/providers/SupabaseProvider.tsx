'use client';

import { ReactNode } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const supabase = createClientComponentClient();

  return <SessionContextProvider supabaseClient={supabase}>{children}</SessionContextProvider>;
}

