import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const supabase = await getSupabaseServer();

  const { data: offerRows } = await supabase
    .from('offers')
    .select('id, status, created_at, requested_listing_id, offered_listing_id')
    .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  const rows = offerRows ?? [];
  const listingIds = [...new Set(rows.flatMap((o) => [o.requested_listing_id, o.offered_listing_id]).filter(Boolean))];
  const { data: listingRows } =
    listingIds.length > 0
      ? await supabase.from('listings').select('id, year, make, model').in('id', listingIds)
      : { data: [] };
  const listingsById = new Map((listingRows ?? []).map((l) => [l.id, l]));

  const list = rows.map((o) => ({
    ...o,
    requested_listing: listingsById.get(o.requested_listing_id),
    offered_listing: listingsById.get(o.offered_listing_id)
  }));

  return (
    <div className="w-full space-y-6">
      <h1 className="text-xl font-semibold text-white">Messages</h1>
      {list.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-400">
          No conversations yet. Make an offer on a listing to start messaging.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((o: Record<string, unknown>) => (
            <li key={o.id as string}>
              <Link
                href={`/messages/${o.id}`}
                className="card block p-4 hover:border-brand/50"
              >
                <span className="text-sm text-white">
                  {(o.requested_listing as { year?: number; make?: string; model?: string })?.year}{' '}
                  {(o.requested_listing as { make?: string })?.make}{' '}
                  {(o.requested_listing as { model?: string })?.model}
                </span>
                <span className="text-slate-400"> ↔ </span>
                <span className="text-sm text-slate-300">
                  {(o.offered_listing as { year?: number; make?: string; model?: string })?.year}{' '}
                  {(o.offered_listing as { make?: string })?.make}{' '}
                  {(o.offered_listing as { model?: string })?.model}
                </span>
                <span className="ml-2 text-xs text-slate-500">{String(o.status)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
