import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { getSupabaseServer } from '@/lib/auth/server';
import { updateListing } from '@/app/actions/listings';

type Props = { params: { id: string }; searchParams: { error?: string } };

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

export default async function EditListingPage({ params, searchParams }: Props) {
  const { id } = params;
  const errorMessage = searchParams?.error;
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const supabase = await getSupabaseServer();
  const { data: listing } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  if (!listing || listing.user_id !== user.id) notFound();

  const { data: photos } = await supabase
    .from('listing_photos')
    .select('photo_url')
    .eq('listing_id', id)
    .order('sort_order', { ascending: true })
    .limit(1);
  const photoUrl = photos?.[0]?.photo_url ?? '';

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Edit listing</h1>
        <p className="text-sm text-slate-400">
          {listing.year} {listing.make} {listing.model}
        </p>
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
      <form action={(fd) => updateListing(id, fd)} className="card space-y-4 p-6">
        <div>
          <label htmlFor="photo_file" className="block text-xs font-medium text-slate-300">
            Photo upload
          </label>
          <input
            id="photo_file"
            name="photo_file"
            type="file"
            accept="image/*"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:text-slate-200 hover:file:bg-slate-700"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Optional. Max 7MB. If you upload a photo, it overrides Photo URL.
          </p>
        </div>
        <div>
          <label htmlFor="photo_url" className="block text-xs font-medium text-slate-300">Photo URL</label>
          <input id="photo_url" name="photo_url" type="url" defaultValue={photoUrl} placeholder="https://..." className={inputClass} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="year" className="block text-xs font-medium text-slate-300">Year *</label>
            <input id="year" name="year" type="number" min="1900" max={new Date().getFullYear() + 1} required defaultValue={listing.year} className={inputClass} />
          </div>
          <div>
            <label htmlFor="make" className="block text-xs font-medium text-slate-300">Make *</label>
            <input id="make" name="make" type="text" required defaultValue={listing.make} className={inputClass} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="model" className="block text-xs font-medium text-slate-300">Model *</label>
            <input id="model" name="model" type="text" required defaultValue={listing.model} className={inputClass} />
          </div>
          <div>
            <label htmlFor="trim" className="block text-xs font-medium text-slate-300">Trim</label>
            <input id="trim" name="trim" type="text" defaultValue={listing.trim ?? ''} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="mileage" className="block text-xs font-medium text-slate-300">Mileage *</label>
          <input id="mileage" name="mileage" type="number" min="0" required defaultValue={listing.mileage} className={inputClass} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="transmission" className="block text-xs font-medium text-slate-300">Transmission</label>
            <input id="transmission" name="transmission" type="text" defaultValue={listing.transmission ?? ''} className={inputClass} />
          </div>
          <div>
            <label htmlFor="drivetrain" className="block text-xs font-medium text-slate-300">Drivetrain</label>
            <input id="drivetrain" name="drivetrain" type="text" defaultValue={listing.drivetrain ?? ''} className={inputClass} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="condition" className="block text-xs font-medium text-slate-300">Condition</label>
            <select id="condition" name="condition" defaultValue={listing.condition ?? ''} className={inputClass}>
              <option value="">Select</option>
              <option value="excellent">Excellent</option>
              <option value="very_good">Very good</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
            </select>
          </div>
          <div>
            <label htmlFor="title_status" className="block text-xs font-medium text-slate-300">Title status</label>
            <select id="title_status" name="title_status" defaultValue={listing.title_status ?? ''} className={inputClass}>
              <option value="">Select</option>
              <option value="clean">Clean</option>
              <option value="salvage">Salvage</option>
              <option value="rebuilt">Rebuilt</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="intent" className="block text-xs font-medium text-slate-300">Intent *</label>
          <select id="intent" name="intent" required defaultValue={listing.intent} className={inputClass}>
            <option value="trade_only">Trade only</option>
            <option value="sell_only">Sell only</option>
            <option value="trade_or_sell">Trade or sell</option>
          </select>
        </div>
        <div>
          <label htmlFor="status" className="block text-xs font-medium text-slate-300">Status</label>
          <select id="status" name="status" defaultValue={listing.status} className={inputClass}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className="block text-xs font-medium text-slate-300">City</label>
            <input id="city" name="city" type="text" defaultValue={listing.city ?? ''} className={inputClass} />
          </div>
          <div>
            <label htmlFor="state" className="block text-xs font-medium text-slate-300">State</label>
            <input id="state" name="state" type="text" defaultValue={listing.state ?? ''} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor="mods_text" className="block text-xs font-medium text-slate-300">Modifications</label>
          <textarea id="mods_text" name="mods_text" rows={2} defaultValue={listing.mods_text ?? ''} className={inputClass} />
        </div>
        <div>
          <label htmlFor="maintenance_text" className="block text-xs font-medium text-slate-300">Maintenance notes</label>
          <textarea id="maintenance_text" name="maintenance_text" rows={2} defaultValue={listing.maintenance_text ?? ''} className={inputClass} />
        </div>
        <div>
          <label htmlFor="trade_preferences_text" className="block text-xs font-medium text-slate-300">Trade preferences</label>
          <textarea id="trade_preferences_text" name="trade_preferences_text" rows={2} defaultValue={listing.trade_preferences_text ?? ''} className={inputClass} />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary">Save changes</button>
          <Link href="/dashboard" className="btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
