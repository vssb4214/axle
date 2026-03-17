import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { createListing } from '@/app/actions/listings';

export default async function CreateListingPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth');

  const errorMessage = searchParams?.error;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">List your car</h1>
        <p className="text-sm text-slate-400">Add a listing for trade, sale, or both.</p>
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

      <form action={createListing} className="card space-y-4 p-6">
        <div>
          <label htmlFor="photo_url" className="block text-xs font-medium text-slate-300">
            Photo URL
          </label>
          <input
            id="photo_url"
            name="photo_url"
            type="url"
            placeholder="https://..."
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="year" className="block text-xs font-medium text-slate-300">
              Year *
            </label>
            <input
              id="year"
              name="year"
              type="number"
              min="1900"
              max={new Date().getFullYear() + 1}
              required
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="make" className="block text-xs font-medium text-slate-300">
              Make *
            </label>
            <input
              id="make"
              name="make"
              type="text"
              required
              placeholder="e.g. BMW"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="model" className="block text-xs font-medium text-slate-300">
              Model *
            </label>
            <input
              id="model"
              name="model"
              type="text"
              required
              placeholder="e.g. 330Ci"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="trim" className="block text-xs font-medium text-slate-300">
              Trim
            </label>
            <input
              id="trim"
              name="trim"
              type="text"
              placeholder="e.g. ZHP"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        <div>
          <label htmlFor="mileage" className="block text-xs font-medium text-slate-300">
            Mileage *
          </label>
          <input
            id="mileage"
            name="mileage"
            type="number"
            min="0"
            required
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="transmission" className="block text-xs font-medium text-slate-300">
              Transmission
            </label>
            <input
              id="transmission"
              name="transmission"
              type="text"
              placeholder="Manual / Auto"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label htmlFor="drivetrain" className="block text-xs font-medium text-slate-300">
              Drivetrain
            </label>
            <input
              id="drivetrain"
              name="drivetrain"
              type="text"
              placeholder="RWD / FWD / AWD"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="condition" className="block text-xs font-medium text-slate-300">
              Condition
            </label>
            <select
              id="condition"
              name="condition"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Select</option>
              <option value="excellent">Excellent</option>
              <option value="very_good">Very good</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
            </select>
          </div>
          <div>
            <label htmlFor="title_status" className="block text-xs font-medium text-slate-300">
              Title status
            </label>
            <select
              id="title_status"
              name="title_status"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              <option value="">Select</option>
              <option value="clean">Clean</option>
              <option value="salvage">Salvage</option>
              <option value="rebuilt">Rebuilt</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="intent" className="block text-xs font-medium text-slate-300">
            Intent *
          </label>
          <select
            id="intent"
            name="intent"
            required
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="trade_only">Trade only</option>
            <option value="sell_only">Sell only</option>
            <option value="trade_or_sell">Trade or sell</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="city" className="block text-xs font-medium text-slate-300">
              City
            </label>
            <input
              id="city"
              name="city"
              type="text"
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
              placeholder="e.g. TX"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        <div>
          <label htmlFor="mods_text" className="block text-xs font-medium text-slate-300">
            Modifications
          </label>
          <textarea
            id="mods_text"
            name="mods_text"
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="List any mods or leave blank"
          />
        </div>
        <div>
          <label htmlFor="maintenance_text" className="block text-xs font-medium text-slate-300">
            Maintenance notes
          </label>
          <textarea
            id="maintenance_text"
            name="maintenance_text"
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="Recent work, records, etc."
          />
        </div>
        <div>
          <label htmlFor="trade_preferences_text" className="block text-xs font-medium text-slate-300">
            Trade preferences
          </label>
          <textarea
            id="trade_preferences_text"
            name="trade_preferences_text"
            rows={2}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            placeholder="Preferred makes, body styles, or value range"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn-primary">
            Create listing
          </button>
          <Link href="/dashboard" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
