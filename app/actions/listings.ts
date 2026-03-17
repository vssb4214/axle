'use server';

import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/db/admin';

const LISTING_PHOTO_BUCKET = 'listing-photos';

function num(s: string | null): number {
  if (s == null || s === '') return 0;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

async function uploadListingPhoto(args: {
  file: File;
  userId: string;
  listingId: string;
}): Promise<{ url: string } | { error: string }> {
  const file = args.file;
  if (!file || typeof file.arrayBuffer !== 'function') return { error: 'Invalid file.' };
  if (!file.type?.startsWith('image/')) return { error: 'Photo must be an image.' };
  if (file.size > 7_000_000) return { error: 'Photo too large (max 7MB).' };

  const ext =
    (file.name?.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') ||
    (file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg');
  const objectPath = `${args.userId}/${args.listingId}/${crypto.randomUUID()}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from(LISTING_PHOTO_BUCKET)
    .upload(objectPath, buf, {
      contentType: file.type,
      upsert: true
    });

  if (uploadError) return { error: uploadError.message };

  const { data } = supabaseAdmin.storage.from(LISTING_PHOTO_BUCKET).getPublicUrl(objectPath);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) return { error: 'Could not get uploaded photo URL.' };
  return { url: publicUrl };
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

  // Photo can be provided as either a URL or an uploaded file (preferred).
  if (listing?.id) {
    let finalPhotoUrl: string | null = (formData.get('photo_url') as string)?.trim() || null;
    const photoFile = formData.get('photo_file');
    if (photoFile instanceof File && photoFile.size > 0) {
      const up = await uploadListingPhoto({ file: photoFile, userId: user.id, listingId: listing.id });
      if ('error' in up) {
        redirect('/create-listing?error=' + encodeURIComponent(up.error));
      }
      finalPhotoUrl = up.url;
    }

    if (finalPhotoUrl) {
      await supabaseAdmin.from('listing_photos').insert({
        listing_id: listing.id,
        photo_url: finalPhotoUrl,
        sort_order: 0
      });
    }
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

  if (listingId) {
    let finalPhotoUrl: string | null = (formData.get('photo_url') as string)?.trim() || null;
    const photoFile = formData.get('photo_file');
    if (photoFile instanceof File && photoFile.size > 0) {
      const up = await uploadListingPhoto({ file: photoFile, userId: user.id, listingId });
      if ('error' in up) {
        redirect('/listings/' + listingId + '/edit?error=' + encodeURIComponent(up.error));
      }
      finalPhotoUrl = up.url;
    }

    if (finalPhotoUrl) {
    const { data: existing } = await supabaseAdmin
      .from('listing_photos')
      .select('id')
      .eq('listing_id', listingId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from('listing_photos').update({ photo_url: finalPhotoUrl }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('listing_photos').insert({ listing_id: listingId, photo_url: finalPhotoUrl, sort_order: 0 });
    }
  }
  }

  revalidatePath('/dashboard');
  revalidatePath('/browse');
  revalidatePath('/listings/' + listingId);
  redirect('/dashboard');
}
