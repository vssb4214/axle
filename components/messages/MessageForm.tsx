'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendMessage } from '@/app/actions/messages';

export function MessageForm({ offerId }: { offerId: string }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || loading) return;
    setLoading(true);
    const res = await sendMessage(offerId, content);
    setLoading(false);
    if (res?.error) {
      alert(res.error);
    } else {
      setContent('');
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-700 pt-3">
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Type a message..."
        className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
      <button type="submit" disabled={loading || !content.trim()} className="btn-primary">
        Send
      </button>
    </form>
  );
}
