'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOffer } from '@/app/actions/offers';

type Listing = { id: string; year?: number; make?: string; model?: string; trim?: string; mileage?: number };

export function OfferForm({
  requestedListingId,
  myListings
}: {
  requestedListingId: string;
  myListings: Listing[];
}) {
  const [offeredListingId, setOfferedListingId] = useState('');
  const [cashDelta, setCashDelta] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!offeredListingId || loading) return;
    setLoading(true);
    const res = await createOffer(
      requestedListingId,
      offeredListingId,
      parseInt(cashDelta, 10) || 0,
      message
    );
    setLoading(false);
    if (res?.error) {
      alert(res.error);
    } else {
      router.push('/offers');
      router.refresh();
    }
  }

  if (myListings.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-slate-400">
        You need at least one active listing to make an offer.{' '}
        <a href="/create-listing" className="text-brand hover:underline">
          Create a listing
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 p-6">
      <div>
        <label htmlFor="offer-listing" className="block text-xs font-medium text-slate-300">
          Your car to offer *
        </label>
        <select
          id="offer-listing"
          required
          value={offeredListingId}
          onChange={(e) => setOfferedListingId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">Select your listing</option>
          {myListings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.year} {l.make} {l.model}
              {l.trim ? ` ${l.trim}` : ''} · {l.mileage?.toLocaleString()} mi
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="cash-delta" className="block text-xs font-medium text-slate-300">
          Cash on top (positive = you add cash, negative = they add)
        </label>
        <input
          id="cash-delta"
          type="number"
          value={cashDelta}
          onChange={(e) => setCashDelta(e.target.value)}
          placeholder="0"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div>
        <label htmlFor="message" className="block text-xs font-medium text-slate-300">
          Message
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Introduce yourself and your car..."
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          Send offer
        </button>
        <a href={`/listings/${requestedListingId}`} className="btn-secondary">
          Cancel
        </a>
      </div>
    </form>
  );
}
