import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';
import { submitRating } from '@/app/actions/ratings';
import { RateForm } from '@/components/ratings/RateForm';

type Props = { params: { offerId: string } };

export default async function RatePage({ params }: Props) {
  const { offerId } = params;
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const supabase = await getSupabaseServer();
  const { data: offer } = await supabase
    .from('offers')
    .select('id, from_user_id, to_user_id, status')
    .eq('id', offerId)
    .single();

  if (!offer || offer.status !== 'accepted') notFound();
  const isFrom = offer.from_user_id === user.id;
  const isTo = offer.to_user_id === user.id;
  const rateeId = isFrom ? offer.to_user_id : offer.from_user_id;
  if (!isFrom && !isTo) notFound();

  const { data: ratee } = await supabase.from('users').select('display_name').eq('id', rateeId).single();
  const { data: existing } = await supabase
    .from('ratings')
    .select('id')
    .eq('offer_id', offerId)
    .eq('from_user_id', user.id)
    .maybeSingle();

  if (existing) {
    redirect('/offers?filter=incoming');
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href="/offers" className="text-xs text-slate-400 hover:text-white">
        ← Back to offers
      </Link>
      <div className="card mt-4 p-6">
        <h1 className="text-lg font-semibold text-white">Leave a rating</h1>
        <p className="mt-1 text-sm text-slate-400">
          How was your trade with {ratee?.display_name ?? 'this user'}?
        </p>
        <RateForm offerId={offerId} toUserId={rateeId} />
      </div>
    </div>
  );
}
