import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';
import { createOffer } from '@/app/actions/offers';
import { OfferForm } from '@/components/offers/OfferForm';

type Props = { params: { id: string } };

export default async function NewOfferPage({ params }: Props) {
  const { id: requestedListingId } = params;
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const supabase = await getSupabaseServer();

  const { data: requestedListing } = await supabase
    .from('listings')
    .select('id, user_id, year, make, model, trim')
    .eq('id', requestedListingId)
    .single();

  if (!requestedListing || requestedListing.user_id === user.id) {
    notFound();
  }

  const { data: myListings } = await supabase
    .from('listings')
    .select('id, year, make, model, trim, mileage')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href={`/listings/${requestedListingId}`} className="text-xs text-slate-400 hover:text-white">
        ← Back to listing
      </Link>
      <div className="card p-4">
        <p className="text-sm text-slate-400">You are offering to trade for:</p>
        <p className="font-medium text-white">
          {requestedListing.year} {requestedListing.make} {requestedListing.model}
          {requestedListing.trim ? ` ${requestedListing.trim}` : ''}
        </p>
      </div>
      <OfferForm
        requestedListingId={requestedListingId}
        myListings={myListings ?? []}
      />
    </div>
  );
}
