'use server';

import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/db/admin';

export async function sendMessage(offerId: string, content: string) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient({ cookies: () => cookieStore });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { data: offer } = await supabaseAdmin
    .from('offers')
    .select('from_user_id, to_user_id')
    .eq('id', offerId)
    .single();
  if (!offer || (offer.from_user_id !== user.id && offer.to_user_id !== user.id)) {
    return { error: 'Not part of this offer.' };
  }

  const { error } = await supabaseAdmin.from('messages').insert({
    offer_id: offerId,
    sender_id: user.id,
    content: content?.trim() || ''
  });

  if (error) return { error: error.message };
  revalidatePath(`/messages/${offerId}`);
  revalidatePath('/messages');
  return { ok: true };
}
