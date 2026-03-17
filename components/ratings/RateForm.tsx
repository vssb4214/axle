'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitRating } from '@/app/actions/ratings';

export function RateForm({ offerId, toUserId }: { offerId: string; toUserId: string }) {
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (stars < 1 || stars > 5 || loading) return;
    setLoading(true);
    const res = await submitRating(offerId, toUserId, stars, review);
    setLoading(false);
    if (res?.error) {
      alert(res.error);
    } else {
      router.push('/offers');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-300">Stars (1–5)</label>
        <div className="mt-2 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              className={`h-10 w-10 rounded-full text-lg ${
                stars >= n ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-400'
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="review" className="block text-xs font-medium text-slate-300">
          Review (optional)
        </label>
        <textarea
          id="review"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder="How did the trade go?"
        />
      </div>
      <button type="submit" disabled={loading || stars < 1} className="btn-primary">
        Submit rating
      </button>
    </form>
  );
}
