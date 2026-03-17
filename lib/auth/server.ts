import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerComponentClient({
      cookies: () => cookieStore
    });
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerComponentClient({
    cookies: () => cookieStore
  });
}
