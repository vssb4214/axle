'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, getSupabaseServer } from '@/lib/auth/server';

export async function createWatchlist(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;

  const year = formData.get('year')?.toString().trim();
  const make = formData.get('make')?.toString().trim();
  const model = formData.get('model')?.toString().trim();
  const trim = formData.get('trim')?.toString().trim();
  const maxMileage = formData.get('max_mileage')?.toString().trim();
  const zip = formData.get('zip')?.toString().trim();
  const radius = formData.get('radius_miles')?.toString().trim();
  const maxPrice = formData.get('max_price')?.toString().trim();

  if (!make || !model) return;

  const supabase = await getSupabaseServer();

  const { error } = await supabase.from('watchlists').insert({
    user_id: user.id,
    year: year ? parseInt(year, 10) : null,
    make: make || null,
    model: model || null,
    trim: trim || null,
    max_mileage: maxMileage ? parseInt(maxMileage, 10) : null,
    zip: zip || null,
    radius_miles: radius ? parseInt(radius, 10) : null,
    max_price: maxPrice ? parseInt(maxPrice, 10) : null,
    enabled: true
  });

  if (error) return;

  revalidatePath('/watchlists');
}

export async function toggleWatchlist(id: string, enabled: boolean) {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('watchlists').update({ enabled }).eq('id', id);
  if (error) return;
  revalidatePath('/watchlists');
}

export async function deleteWatchlist(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from('watchlists').delete().eq('id', id);
  if (error) return;
  revalidatePath('/watchlists');
}
