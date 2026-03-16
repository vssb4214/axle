import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const admin = createClient(url, serviceKey);
  const { error: upsertError } = await admin.from('users').upsert(
    {
      id: user.id,
      email: user.email ?? '',
      display_name: user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null
    },
    { onConflict: 'id' }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
