import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';
import { updateProfile } from '@/app/actions/profile';

export default async function ProfileEditPage({
  searchParams
}: { searchParams: { error?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const supabase = await getSupabaseServer();
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, bio, city, state')
    .eq('id', user.id)
    .single();

  const errorMessage = searchParams?.error;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Edit profile</h1>
        <p className="text-sm text-slate-400">Update your display name and location.</p>
      </div>
      {errorMessage && (
        <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {(() => {
            try {
              return decodeURIComponent(errorMessage);
            } catch {
              return errorMessage;
            }
          })()}
        </div>
      )}
      <form action={updateProfile} className="card space-y-4 p-6">
        <div>
          <label htmlFor="display_name" className="block text-xs font-medium text-slate-300">
            Display name
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            defaultValue={profile?.display_name ?? ''}
            placeholder="Your name"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="city" className="block text-xs font-medium text-slate-300">
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={profile?.city ?? ''}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="state" className="block text-xs font-medium text-slate-300">
            State
          </label>
          <input
            id="state"
            name="state"
            type="text"
            defaultValue={profile?.state ?? ''}
            placeholder="e.g. TX"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label htmlFor="bio" className="block text-xs font-medium text-slate-300">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={3}
            defaultValue={profile?.bio ?? ''}
            placeholder="A bit about you and what you drive..."
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="flex gap-3">
          <button type="submit" className="btn-primary">
            Save
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
