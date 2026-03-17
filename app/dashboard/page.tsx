import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const supabase = await getSupabaseServer();

  const [listingsRes, outgoingRes, incomingRes] = await Promise.all([
    supabase.from('listings').select('id, year, make, model, trim, mileage, intent, status').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('offers').select('id, status, created_at', { count: 'exact', head: false }).eq('from_user_id', user.id),
    supabase.from('offers').select('id, status, created_at', { count: 'exact', head: false }).eq('to_user_id', user.id)
  ]);

  const listings = listingsRes.data ?? [];
  const outgoingCount = outgoingRes.data?.length ?? 0;
  const incomingCount = incomingRes.data?.length ?? 0;

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Your listings and activity</p>
          <Link href={`/profile/${user.id}`} className="mt-1 inline-block text-xs text-brand hover:underline">
            View my profile
          </Link>
        </div>
        <Link href="/create-listing" className="btn-primary">
          List my car
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/offers?filter=outgoing" className="card block p-4 hover:border-brand/50">
          <div className="text-2xl font-semibold text-white">{outgoingCount}</div>
          <div className="text-sm text-slate-400">Offers sent</div>
        </Link>
        <Link href="/offers?filter=incoming" className="card block p-4 hover:border-brand/50">
          <div className="text-2xl font-semibold text-white">{incomingCount}</div>
          <div className="text-sm text-slate-400">Offers received</div>
        </Link>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-white">My listings</h2>
        {listings.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-400">
            You haven&apos;t listed any cars yet.{' '}
            <Link href="/create-listing" className="text-brand hover:underline">
              List your first car
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {listings.map((l) => (
              <li key={l.id}>
                <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
                  <Link href={`/listings/${l.id}`} className="min-w-0 flex-1 hover:opacity-90">
                    <div>
                      <span className="font-medium text-white">
                        {l.year} {l.make} {l.model}
                        {l.trim ? ` ${l.trim}` : ''}
                      </span>
                      <span className="ml-2 text-slate-400">
                        {l.mileage?.toLocaleString()} mi · {l.intent?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                      {l.status}
                    </span>
                    <Link
                      href={`/listings/${l.id}/edit`}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
