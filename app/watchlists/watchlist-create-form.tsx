'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? 'Creating…' : 'Create watchlist'}
    </button>
  );
}

type Props = {
  action: (formData: FormData) => void;
  disabled?: boolean;
};

export default function WatchlistCreateForm({ action, disabled }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'ok' } | { kind: 'error'; message: string }>({
    kind: 'idle'
  });

  useEffect(() => {
    if (status.kind === 'idle') return;
    const t = setTimeout(() => setStatus({ kind: 'idle' }), 4000);
    return () => clearTimeout(t);
  }, [status.kind]);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        setStatus({ kind: 'idle' });
        try {
          await action(formData);
          formRef.current?.reset();
          setStatus({ kind: 'ok' });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Something went wrong.';
          setStatus({ kind: 'error', message: msg });
        }
      }}
      className="card space-y-4 p-6"
    >
      {status.kind === 'ok' ? (
        <div className="rounded-lg border border-emerald-700/60 bg-emerald-900/20 p-3 text-xs text-emerald-200">
          Watchlist created.
        </div>
      ) : null}

      {status.kind === 'error' ? (
        <div className="rounded-lg border border-rose-700/60 bg-rose-900/20 p-3 text-xs text-rose-200">
          Failed to create watchlist: {status.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-300">Make</label>
          <input
            name="make"
            required
            autoCapitalize="words"
            autoCorrect="off"
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            placeholder="e.g. Toyota"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300">Model</label>
          <input
            name="model"
            required
            autoCapitalize="words"
            autoCorrect="off"
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            placeholder="e.g. Tacoma"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-300">Year (optional)</label>
          <input
            name="year"
            type="number"
            min={1900}
            max={new Date().getFullYear() + 1}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            placeholder="2012"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300">Trim (optional)</label>
          <input
            name="trim"
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            placeholder="TRD Off-Road"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-slate-300">Max mileage (optional)</label>
          <input
            name="max_mileage"
            type="number"
            min={0}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            placeholder="120000"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300">Max price ($, optional)</label>
          <input
            name="max_price"
            type="number"
            min={0}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            placeholder="18000"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300">ZIP (optional)</label>
          <input
            name="zip"
            inputMode="numeric"
            pattern="[0-9]{5}"
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            placeholder="92101"
          />
          <p className="mt-1 text-[11px] text-slate-500">US 5-digit ZIP. Leave blank for nationwide.</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-300">Radius (miles)</label>
        <input
          name="radius_miles"
          type="number"
          min={1}
          max={500}
          disabled={disabled}
          className="mt-1 w-40 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
          placeholder="200"
        />
      </div>

      <SubmitButton />

      <p className="text-xs text-slate-500">
        Tip: Watchlists require the <code>watchlists</code> table. If it isn&apos;t created yet, the page will still load,
        but actions may be disabled.
      </p>
    </form>
  );
}
