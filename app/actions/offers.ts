'use server';

import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/db/admin';

export async function createOffer(
  requestedListingId: string,
  offeredListingId: string,
  cashDelta: number,
  message: string
) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient({ cookies: () => cookieStore });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { data: listing } = await supabaseAdmin
    .from('listings')
    .select('user_id')
    .eq('id', requestedListingId)
    .single();
  if (!listing?.user_id) {
    return { error: 'Listing not found.' };
  }
  if (listing.user_id === user.id) {
    return { error: 'You cannot make an offer on your own listing.' };
  }

  const { error } = await supabaseAdmin.from('offers').insert({
    from_user_id: user.id,
    to_user_id: listing.user_id,
    requested_listing_id: requestedListingId,
    offered_listing_id: offeredListingId,
    cash_delta: cashDelta,
    message: message?.trim() || null,
    status: 'pending'
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath('/offers');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateOfferStatus(offerId: string, status: 'accepted' | 'declined') {
  const cookieStore = await cookies();
  const supabase = createServerActionClient({ cookies: () => cookieStore });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { data: offer } = await supabaseAdmin
    .from('offers')
    .select('to_user_id')
    .eq('id', offerId)
    .single();
  if (!offer || offer.to_user_id !== user.id) {
    return { error: 'Not authorized to update this offer.' };
  }

  const { error } = await supabaseAdmin
    .from('offers')
    .update({ status })
    .eq('id', offerId);

  if (error) return { error: error.message };
  revalidatePath('/offers');
  revalidatePath('/dashboard');
  return { ok: true };
}
