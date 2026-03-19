'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, getSupabaseServer } from '@/lib/auth/server';

function parseOptionalInt(raw: FormDataEntryValue | null) {
  const s = raw?.toString().trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function clampInt(n: number | null, { min, max }: { min: number; max: number }) {
  if (n == null) return null;
  return Math.max(min, Math.min(max, n));
}

export async function createWatchlist(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not signed in.');

  const make = formData.get('make')?.toString().trim();
  const model = formData.get('model')?.toString().trim();

  if (!make || !model) throw new Error('Make and model are required.');

  const year = clampInt(parseOptionalInt(formData.get('year')), {
    min: 1900,
    max: new Date().getFullYear() + 1
  });
  const maxMileage = clampInt(parseOptionalInt(formData.get('max_mileage')), { min: 0, max: 1_000_000 });
  const radius = clampInt(parseOptionalInt(formData.get('radius_miles')), { min: 1, max: 500 });
  const maxPrice = clampInt(parseOptionalInt(formData.get('max_price')), { min: 0, max: 10_000_000 });

  const trim = formData.get('trim')?.toString().trim() || null;
  const zip = formData.get('zip')?.toString().trim() || null;

  if (zip && !/^[0-9]{5}$/.test(zip)) {
    throw new Error('ZIP must be a 5-digit US ZIP code.');
  }

  const supabase = await getSupabaseServer();

  const { error } = await supabase.from('watchlists').insert({
    user_id: user.id,
    year,
    make,
    model,
    trim,
    max_mileage: maxMileage,
    zip,
    radius_miles: radius,
    max_price: maxPrice,
    enabled: true
  });

  if (error) throw new Error(error.message);

  revalidatePath('/watchlists');
}

export async function toggleWatchlist(id: string, enabled: boolean) {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('watchlists')
    .update({ enabled })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return;
  revalidatePath('/watchlists');
}

export async function deleteWatchlist(id: string) {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from('watchlists')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return;
  revalidatePath('/watchlists');
}
