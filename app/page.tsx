import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex w-full flex-col gap-10 py-8">
      <section className="grid gap-8 md:grid-cols-[3fr,2fr] items-center">
        <div className="space-y-6">
          <div className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
            Honest, comps-based car trading
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Trade cars without getting lowballed.
          </h1>
          <p className="max-w-xl text-sm text-slate-300 sm:text-base">
            Axle uses real market comps and local AI to give you transparent private-party values,
            fair trade matches, and a neutral baseline for negotiations.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/create-listing" className="btn-primary">
              List my car
            </Link>
            <Link href="/browse" className="btn-secondary">
              Browse cars
            </Link>
          </div>
          <div className="grid gap-4 text-xs text-slate-300 sm:grid-cols-3">
            <div className="card p-3">
              <div className="text-sm font-semibold text-white">Comps, not vibes</div>
              <p className="mt-1">
                Valuations are grounded in real listings from marketplaces and enthusiast communities.
              </p>
            </div>
            <div className="card p-3">
              <div className="text-sm font-semibold text-white">Local AI, no hype</div>
              <p className="mt-1">
                Ollama runs locally for extraction and explanations. Prices come from data, not model guesses.
              </p>
            </div>
            <div className="card p-3">
              <div className="text-sm font-semibold text-white">Built for enthusiasts</div>
              <p className="mt-1">
                Understand how mods, condition, and rarity affect value—with clear confidence scores.
              </p>
            </div>
          </div>
        </div>
        <div className="card relative overflow-hidden p-4">
          <div className="absolute inset-0 bg-gradient-to-br from-brand/30 via-slate-900 to-slate-950 opacity-60" />
          <div className="relative space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-200">
              <span>Example valuation</span>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                High confidence
              </span>
            </div>
            <div className="rounded-xl bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">2004 BMW 330Ci ZHP</div>
              <div className="mt-1 text-lg font-semibold">$8.9k – $10.4k fair range</div>
              <p className="mt-2 text-xs text-slate-300">
                Based on 12 similar E46 coupes within 300 miles, adjusted for mileage, ZHP package, and condition.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-slate-200">
                <li>• 3 lower-mile ZHPs trading $10.5k–$12k</li>
                <li>• 5 non-ZHP 330Cis at $6.5k–$8.5k</li>
                <li>• 4 forum listings with similar mods and maintenance</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white">How valuation works</h2>
          <p className="mt-2 text-xs text-slate-300">
            We pull comparable listings from multiple public sources, normalize them, and apply deterministic pricing
            logic. Ollama helps parse messy text and explain the result—but never invents prices.
          </p>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white">Why comps matter</h2>
          <p className="mt-2 text-xs text-slate-300">
            Your car is worth what similar cars actually sell for. We surface 5–10 relevant comps with context so you
            can see the market, not just a single number.
          </p>
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white">Trade matching</h2>
          <p className="mt-2 text-xs text-slate-300">
            We match you with owners in a similar value band, factoring in trade preferences, location, and optional
            cash top-up so both sides see a fair deal.
          </p>
        </div>
      </section>
    </div>
  );
}

