'use server';

import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/db/admin';

function num(s: string | null): number {
  if (s == null || s === '') return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

export async function createListing(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient({ cookies: () => cookieStore });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const year = num(formData.get('year') as string);
  const mileage = num(formData.get('mileage') as string);
  const make = (formData.get('make') as string)?.trim() ?? '';
  const model = (formData.get('model') as string)?.trim() ?? '';
  if (!year || !make || !model || !mileage) {
    redirect('/create-listing?error=' + encodeURIComponent('Year, make, model, and mileage are required.'));
  }

  const { data: listing, error } = await supabaseAdmin
    .from('listings')
    .insert({
      user_id: user.id,
      year,
      make,
      model,
      trim: (formData.get('trim') as string)?.trim() || null,
      mileage,
      transmission: (formData.get('transmission') as string)?.trim() || null,
      drivetrain: (formData.get('drivetrain') as string)?.trim() || null,
      condition: (formData.get('condition') as string)?.trim() || null,
      title_status: (formData.get('title_status') as string)?.trim() || null,
      mods_text: (formData.get('mods_text') as string)?.trim() || null,
      maintenance_text: (formData.get('maintenance_text') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      intent: (formData.get('intent') as string) || 'trade_or_sell',
      trade_preferences_text: (formData.get('trade_preferences_text') as string)?.trim() || null,
      status: 'active'
    })
    .select('id')
    .single();

  if (error) {
    redirect('/create-listing?error=' + encodeURIComponent(error.message));
  }

  const photoUrl = (formData.get('photo_url') as string)?.trim();
  if (listing?.id && photoUrl) {
    await supabaseAdmin.from('listing_photos').insert({
      listing_id: listing.id,
      photo_url: photoUrl,
      sort_order: 0
    });
  }

  revalidatePath('/dashboard');
  revalidatePath('/browse');
  redirect('/dashboard');
}

export async function updateListing(listingId: string, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createServerActionClient({ cookies: () => cookieStore });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const { data: listing } = await supabaseAdmin
    .from('listings')
    .select('user_id')
    .eq('id', listingId)
    .single();
  if (!listing || listing.user_id !== user.id) {
    redirect('/dashboard?error=' + encodeURIComponent('Not your listing.'));
  }

  const year = num(formData.get('year') as string);
  const mileage = num(formData.get('mileage') as string);
  const make = (formData.get('make') as string)?.trim() ?? '';
  const model = (formData.get('model') as string)?.trim() ?? '';
  if (!year || !make || !model || !mileage) {
    redirect('/listings/' + listingId + '/edit?error=' + encodeURIComponent('Year, make, model, and mileage are required.'));
  }

  const { error } = await supabaseAdmin
    .from('listings')
    .update({
      year,
      make,
      model,
      trim: (formData.get('trim') as string)?.trim() || null,
      mileage,
      transmission: (formData.get('transmission') as string)?.trim() || null,
      drivetrain: (formData.get('drivetrain') as string)?.trim() || null,
      condition: (formData.get('condition') as string)?.trim() || null,
      title_status: (formData.get('title_status') as string)?.trim() || null,
      mods_text: (formData.get('mods_text') as string)?.trim() || null,
      maintenance_text: (formData.get('maintenance_text') as string)?.trim() || null,
      city: (formData.get('city') as string)?.trim() || null,
      state: (formData.get('state') as string)?.trim() || null,
      intent: (formData.get('intent') as string) || 'trade_or_sell',
      trade_preferences_text: (formData.get('trade_preferences_text') as string)?.trim() || null,
      status: (formData.get('status') as string) || 'active'
    })
    .eq('id', listingId);

  if (error) {
    redirect('/listings/' + listingId + '/edit?error=' + encodeURIComponent(error.message));
  }

  const photoUrl = (formData.get('photo_url') as string)?.trim();
  if (photoUrl) {
    const { data: existing } = await supabaseAdmin
      .from('listing_photos')
      .select('id')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from('listing_photos').update({ photo_url: photoUrl }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('listing_photos').insert({ listing_id: listingId, photo_url: photoUrl, sort_order: 0 });
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/browse');
  revalidatePath('/listings/' + listingId);
  redirect('/dashboard');
}
