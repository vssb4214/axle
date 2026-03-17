'use server';

import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/db/admin';

export async function updateProfile(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient({ cookies: () => cookieStore });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const display_name = (formData.get('display_name') as string)?.trim() || null;
  const bio = (formData.get('bio') as string)?.trim() || null;
  const city = (formData.get('city') as string)?.trim() || null;
  const state = (formData.get('state') as string)?.trim() || null;

  const { error } = await supabaseAdmin
    .from('users')
    .update({ display_name, bio, city, state })
    .eq('id', user.id);

  if (error) {
    redirect('/profile/edit?error=' + encodeURIComponent(error.message));
  }
  revalidatePath('/profile/edit');
  revalidatePath('/dashboard');
  revalidatePath('/profile/' + user.id);
  redirect('/profile/' + user.id);
}
