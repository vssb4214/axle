import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';
import { updateOfferStatus } from '@/app/actions/offers';
import { OfferActions } from '@/components/offers/OfferActions';

type SearchParams = { filter?: string };

export default async function OffersPage({
  searchParams
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const { filter } = searchParams ?? {};
  const supabase = await getSupabaseServer();

  const incoming = await supabase
    .from('offers')
    .select(
      'id, status, cash_delta, message, created_at, requested_listing_id, offered_listing_id, from_user_id'
    )
    .eq('to_user_id', user.id)
    .order('created_at', { ascending: false });

  const outgoing = await supabase
    .from('offers')
    .select(
      'id, status, cash_delta, message, created_at, requested_listing_id, offered_listing_id, to_user_id'
    )
    .eq('from_user_id', user.id)
    .order('created_at', { ascending: false });

  const incomingRows = incoming.data ?? [];
  const outgoingRows = outgoing.data ?? [];

  const allListingIds = [
    ...incomingRows.flatMap((o) => [o.requested_listing_id, o.offered_listing_id]),
    ...outgoingRows.flatMap((o) => [o.requested_listing_id, o.offered_listing_id])
  ].filter(Boolean);
  const uniqListingIds = [...new Set(allListingIds)];

  const { data: listingRows } =
    uniqListingIds.length > 0
      ? await supabase
          .from('listings')
          .select('id, year, make, model, trim, mileage')
          .in('id', uniqListingIds)
      : { data: [] };

  const listingsById = new Map(
    (listingRows ?? []).map((l) => [l.id, l])
  );

  const userIds = [
    ...incomingRows.map((o) => o.from_user_id),
    ...outgoingRows.map((o) => o.to_user_id)
  ].filter(Boolean);
  const uniqUserIds = [...new Set(userIds)];
  const { data: userRows } =
    uniqUserIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', uniqUserIds)
      : { data: [] };
  const usersById = new Map((userRows ?? []).map((u) => [u.id, u]));

  const incomingList = incomingRows.map((o) => ({
    ...o,
    requested_listing: listingsById.get(o.requested_listing_id),
    offered_listing: listingsById.get(o.offered_listing_id),
    from_user: usersById.get(o.from_user_id)
  }));
  const outgoingList = outgoingRows.map((o) => ({
    ...o,
    requested_listing: listingsById.get(o.requested_listing_id),
    offered_listing: listingsById.get(o.offered_listing_id),
    to_user: usersById.get(o.to_user_id)
  }));

  const showIncoming = filter !== 'outgoing';
  const showOutgoing = filter !== 'incoming';

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-semibold text-white">Offers</h1>
        <div className="flex gap-2">
          <Link
            href="/offers"
            className={`rounded-full px-3 py-1 text-sm ${!filter ? 'bg-brand/20 text-brand' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            All
          </Link>
          <Link
            href="/offers?filter=incoming"
            className={`rounded-full px-3 py-1 text-sm ${filter === 'incoming' ? 'bg-brand/20 text-brand' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Incoming
          </Link>
          <Link
            href="/offers?filter=outgoing"
            className={`rounded-full px-3 py-1 text-sm ${filter === 'outgoing' ? 'bg-brand/20 text-brand' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            Outgoing
          </Link>
        </div>
      </div>

      {showIncoming && incomingList.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Incoming</h2>
          <ul className="space-y-3">
            {incomingList.map((o: Record<string, unknown>) => (
              <li key={o.id as string} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-white">
                      <span className="font-medium">{(o.from_user as { display_name?: string })?.display_name ?? 'User'}</span>
                      {' wants to trade for your '}
                      <Link
                        href={`/listings/${(o.requested_listing as { id: string })?.id}`}
                        className="text-brand hover:underline"
                      >
                        {(o.requested_listing as { year?: number; make?: string; model?: string; trim?: string })?.year}{' '}
                        {(o.requested_listing as { make?: string })?.make}{' '}
                        {(o.requested_listing as { model?: string })?.model}
                      </Link>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Their car: {(o.offered_listing as { year?: number; make?: string; model?: string })?.year}{' '}
                      {(o.offered_listing as { make?: string })?.make}{' '}
                      {(o.offered_listing as { model?: string })?.model}
                      {Number(o.cash_delta) !== 0 && (
                        <> · Cash {Number(o.cash_delta) > 0 ? '+' : ''}{Number(o.cash_delta).toLocaleString()}</>
                      )}
                    </p>
                    {o.message ? (
                      <p className="mt-2 text-xs text-slate-300">&ldquo;{String(o.message)}&rdquo;</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                      {String(o.status)}
                    </span>
                    {(o.status as string) === 'pending' && (
                      <OfferActions offerId={o.id as string} />
                    )}
                    {(o.status as string) === 'accepted' && (
                      <Link href={`/offers/${o.id}/rate`} className="rounded-full bg-amber-600/20 px-3 py-1 text-xs text-amber-300 hover:bg-amber-600/30">
                        Leave rating
                      </Link>
                    )}
                    <Link
                      href={`/messages/${o.id}`}
                      className="btn-secondary text-xs"
                    >
                      Message
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showOutgoing && outgoingList.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Outgoing</h2>
          <ul className="space-y-3">
            {outgoingList.map((o: Record<string, unknown>) => (
              <li key={o.id as string} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">
                      You offered your{' '}
                      <Link
                        href={`/listings/${(o.offered_listing as { id: string })?.id}`}
                        className="text-brand hover:underline"
                      >
                        {(o.offered_listing as { year?: number; make?: string; model?: string })?.year}{' '}
                        {(o.offered_listing as { make?: string })?.make}{' '}
                        {(o.offered_listing as { model?: string })?.model}
                      </Link>
                      {' for their '}
                      <Link
                        href={`/listings/${(o.requested_listing as { id: string })?.id}`}
                        className="text-brand hover:underline"
                      >
                        {(o.requested_listing as { year?: number; make?: string; model?: string })?.year}{' '}
                        {(o.requested_listing as { make?: string })?.make}{' '}
                        {(o.requested_listing as { model?: string })?.model}
                      </Link>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      To: {(o.to_user as { display_name?: string })?.display_name ?? 'User'}
                      {Number(o.cash_delta) !== 0 && (
                        <> · Cash {Number(o.cash_delta) > 0 ? '+' : ''}{Number(o.cash_delta).toLocaleString()}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                      {String(o.status)}
                    </span>
                    {(o.status as string) === 'accepted' && (
                      <Link href={`/offers/${o.id}/rate`} className="rounded-full bg-amber-600/20 px-3 py-1 text-xs text-amber-300 hover:bg-amber-600/30">
                        Leave rating
                      </Link>
                    )}
                    <Link href={`/messages/${o.id}`} className="btn-secondary text-xs">
                      Message
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {incomingList.length === 0 && outgoingList.length === 0 && (
        <div className="card p-6 text-center text-sm text-slate-400">
          No offers yet. Browse{' '}
          <Link href="/browse" className="text-brand hover:underline">
            listings
          </Link>{' '}
          and use &ldquo;Offer Trade&rdquo; on a listing to make an offer.
        </div>
      )}
    </div>
  );
}
