import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';
import { sendMessage } from '@/app/actions/messages';
import { MessageForm } from '@/components/messages/MessageForm';

type Props = { params: { offerId: string } };

export default async function MessageThreadPage({ params }: Props) {
  const { offerId } = params;
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const supabase = await getSupabaseServer();

  const { data: offerRow } = await supabase
    .from('offers')
    .select('id, from_user_id, to_user_id, requested_listing_id, offered_listing_id')
    .eq('id', offerId)
    .single();

  if (!offerRow || (offerRow.from_user_id !== user.id && offerRow.to_user_id !== user.id)) {
    notFound();
  }

  const { data: listingRows } = await supabase
    .from('listings')
    .select('id, year, make, model')
    .in('id', [offerRow.requested_listing_id, offerRow.offered_listing_id]);
  const listingsById = new Map((listingRows ?? []).map((l) => [l.id, l]));
  const offer = {
    ...offerRow,
    requested_listing: listingsById.get(offerRow.requested_listing_id),
    offered_listing: listingsById.get(offerRow.offered_listing_id)
  };

  const { data: messages } = await supabase
    .from('messages')
    .select('id, content, sender_id, created_at')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: true });

  const msgs = messages ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/messages" className="text-xs text-slate-400 hover:text-white">
        ← Back to messages
      </Link>
      <div className="card p-4">
        <p className="text-sm text-slate-300">
          <span className="text-white">
            {(offer.requested_listing as { year?: number; make?: string; model?: string })?.year}{' '}
            {(offer.requested_listing as { make?: string })?.make}{' '}
            {(offer.requested_listing as { model?: string })?.model}
          </span>
          {' ↔ '}
          <span className="text-white">
            {(offer.offered_listing as { year?: number; make?: string; model?: string })?.year}{' '}
            {(offer.offered_listing as { make?: string })?.make}{' '}
            {(offer.offered_listing as { model?: string })?.model}
          </span>
        </p>
      </div>
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {msgs.length === 0 ? (
            <p className="text-center text-sm text-slate-500">No messages yet. Start the conversation.</p>
          ) : (
            msgs.map((m: { id: string; content: string; sender_id: string; created_at: string }) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.sender_id === user.id
                    ? 'ml-auto bg-brand/20 text-white'
                    : 'bg-slate-800 text-slate-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                <p className="mt-1 text-[10px] opacity-70">
                  {new Date(m.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
        <MessageForm offerId={offerId} />
      </div>
    </div>
  );
}
