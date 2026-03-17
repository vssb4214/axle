import { runHealthChecks } from '@/lib/health/checks';

export const dynamic = 'force-dynamic';

function Badge({ ok }: { ok: boolean }) {
  return (
    <span
      className={
        ok
          ? 'inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300'
          : 'inline-flex rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-200'
      }
    >
      {ok ? 'OK' : 'FAIL'}
    </span>
  );
}

export default async function HealthPage() {
  const checks = await runHealthChecks();
  const allOk = checks.every((c) => c.ok);

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">System health</h1>
        <p className="text-sm text-slate-300">
          Quick sanity checks for local development + future deploy readiness.
        </p>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Overall</div>
          <Badge ok={allOk} />
        </div>
        <div className="mt-3 space-y-3">
          {checks.map((c) => (
            <div key={c.label} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{c.label}</div>
                <Badge ok={c.ok} />
              </div>
              {c.detail ? <div className="mt-1 text-xs text-slate-300">{c.detail}</div> : null}
              {c.meta ? (
                <pre className="mt-2 overflow-x-auto rounded bg-slate-950/70 p-2 text-[11px] text-slate-300">
                  {JSON.stringify(c.meta, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-400">
        Tip: if Supabase fails due to RLS, that can still be fine—log in and try again, or adjust policies.
      </div>
    </div>
  );
}
