import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseServer } from '@/lib/auth/server';

type Props = { params: { userId: string } };

export default async function ProfilePage({ params }: Props) {
  const { userId } = params;
  const supabase = await getSupabaseServer();

  const { data: profile } = await supabase
    .from('users')
    .select('id, display_name, avatar_url, city, state, bio, rating_avg, rating_count, completed_trade_count, created_at')
    .eq('id', userId)
    .single();

  if (!profile) notFound();

  const { data: listings } = await supabase
    .from('listings')
    .select('id, year, make, model, trim, mileage, intent')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(12);

  const { data: ratings } = await supabase
    .from('ratings')
    .select('id, stars, review, created_at, from_user_id')
    .eq('to_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  const raterIds = [...new Set((ratings ?? []).map((r) => r.from_user_id))];
  const { data: raterRows } =
    raterIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', raterIds)
      : { data: [] };
  const ratersById = new Map((raterRows ?? []).map((u) => [u.id, u]));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="card flex flex-wrap gap-4 p-6">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={profile.display_name ?? 'User'}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/20 text-2xl font-semibold text-brand">
            {(profile.display_name ?? 'U').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-white">{profile.display_name ?? 'Enthusiast'}</h1>
          <p className="text-sm text-slate-400">
            {[profile.city, profile.state].filter(Boolean).join(', ') || 'Location not set'}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
            <span>★ {Number(profile.rating_avg).toFixed(1)} ({profile.rating_count} reviews)</span>
            <span>{profile.completed_trade_count} completed trades</span>
          </div>
        </div>
      </div>
      {profile.bio && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-white">Bio</h2>
          <p className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{profile.bio}</p>
        </div>
      )}
      {ratings && ratings.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-white">Recent reviews</h2>
          <ul className="space-y-2">
            {ratings.map((r: { id: string; stars: number; review: string | null; created_at: string; from_user_id: string }) => (
              <li key={r.id} className="card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-amber-400">{'★'.repeat(r.stars)}</span>
                  <span className="text-xs text-slate-500">
                    {(ratersById.get(r.from_user_id) as { display_name?: string } | undefined)?.display_name ?? 'User'} ·{' '}
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                {r.review && <p className="mt-1 text-sm text-slate-300">{r.review}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-white">Active listings</h2>
        {!listings?.length ? (
          <p className="text-sm text-slate-400">No active listings.</p>
        ) : (
          <ul className="space-y-2">
            {listings.map((l: { id: string; year?: number; make?: string; model?: string; trim?: string; mileage?: number; intent?: string }) => (
              <li key={l.id}>
                <Link
                  href={`/listings/${l.id}`}
                  className="card block p-3 hover:border-brand/50"
                >
                  <span className="font-medium text-white">
                    {l.year} {l.make} {l.model}
                    {l.trim ? ` ${l.trim}` : ''}
                  </span>
                  <span className="ml-2 text-slate-400">
                    {l.mileage?.toLocaleString()} mi · {l.intent?.replace(/_/g, ' ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
