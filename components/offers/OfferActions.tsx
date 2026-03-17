'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateOfferStatus } from '@/app/actions/offers';

export function OfferActions({ offerId }: { offerId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleAccept() {
    setLoading(true);
    const res = await updateOfferStatus(offerId, 'accepted');
    setLoading(false);
    if (res?.error) {
      alert(res.error);
    } else {
      router.refresh();
    }
  }

  async function handleDecline() {
    setLoading(true);
    const res = await updateOfferStatus(offerId, 'declined');
    setLoading(false);
    if (res?.error) {
      alert(res.error);
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleAccept}
        disabled={loading}
        className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        Accept
      </button>
      <button
        type="button"
        onClick={handleDecline}
        disabled={loading}
        className="rounded-full border border-slate-600 px-3 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}
