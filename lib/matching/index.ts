import { supabaseClient } from '@/lib/db/client';

/**
 * Fetch other active listings that are open to trade (trade_only or trade_or_sell),
 * excluding the current listing and the current user's listings.
 */
export async function getSuggestedTradeListings(
  currentListingId: string,
  excludeUserId: string,
  limit = 5
) {
  const { data } = await supabaseClient
    .from('listings')
    .select('id, year, make, model, trim, mileage, city, state, intent')
    .eq('status', 'active')
    .neq('id', currentListingId)
    .neq('user_id', excludeUserId)
    .in('intent', ['trade_only', 'trade_or_sell'])
    .order('created_at', { ascending: false })
    .limit(limit);

  return data ?? [];
}
