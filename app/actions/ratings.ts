'use server';

import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/db/admin';

export async function submitRating(offerId: string, toUserId: string, stars: number, review: string) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient({ cookies: () => cookieStore });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  if (stars < 1 || stars > 5) {
    return { error: 'Stars must be 1–5.' };
  }

  const { data: offer } = await supabaseAdmin
    .from('offers')
    .select('from_user_id, to_user_id, status')
    .eq('id', offerId)
    .single();

  if (!offer || offer.status !== 'accepted') {
    return { error: 'Offer not found or not completed.' };
  }

  const isFrom = offer.from_user_id === user.id;
  const isTo = offer.to_user_id === user.id;
  const rateeId = isFrom ? offer.to_user_id : offer.from_user_id;
  if (!isFrom && !isTo) {
    return { error: 'Not part of this offer.' };
  }
  if (rateeId !== toUserId) {
    return { error: 'Wrong user.' };
  }

  const { error } = await supabaseAdmin.from('ratings').insert({
    from_user_id: user.id,
    to_user_id: toUserId,
    offer_id: offerId,
    stars,
    review: review?.trim() || null
  });

  if (error) {
    if (error.code === '23505') return { error: 'You already left a rating for this trade.' };
    return { error: error.message };
  }

  const { data: ratings } = await supabaseAdmin
    .from('ratings')
    .select('stars')
    .eq('to_user_id', toUserId);
  const count = ratings?.length ?? 0;
  const avg = count ? (ratings!.reduce((s, r) => s + r.stars, 0) / count) : 0;
  await supabaseAdmin.from('users').update({ rating_avg: avg, rating_count: count }).eq('id', toUserId);

  revalidatePath('/offers');
  revalidatePath('/profile/' + toUserId);
  return { ok: true };
}
