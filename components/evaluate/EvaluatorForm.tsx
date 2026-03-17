'use client';

import { useRouter } from 'next/navigation';
import { useRef } from 'react';

type Props = {
  defaultYear?: string;
  defaultMake?: string;
  defaultModel?: string;
  defaultTrim?: string;
  defaultMileage?: string;
  defaultCondition?: string;
  defaultTransmission?: string;
  defaultColor?: string;
  defaultWear?: string;
  defaultMods?: string;
  defaultZip?: string;
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

export function EvaluatorForm({
  defaultYear,
  defaultMake,
  defaultModel,
  defaultTrim,
  defaultMileage,
  defaultCondition,
  defaultTransmission,
  defaultColor,
  defaultWear,
  defaultMods,
  defaultZip
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const params = new URLSearchParams();
    const year = fd.get('year');
    const make = fd.get('make');
    const model = fd.get('model');
    const mileage = fd.get('mileage');
    if (year) params.set('year', String(year));
    if (make) params.set('make', String(make));
    if (model) params.set('model', String(model));
    if (mileage) params.set('mileage', String(mileage));
    const trim = fd.get('trim');
    const condition = fd.get('condition');
    const transmission = fd.get('transmission');
    const color = fd.get('color');
    const mods = fd.get('mods');
    const wear = fd.get('wear');
    const zip = fd.get('zip');
    if (trim) params.set('trim', String(trim));
    if (condition) params.set('condition', String(condition));
    if (transmission) params.set('transmission', String(transmission));
    if (color) params.set('color', String(color));
    if (mods) params.set('mods', String(mods));
    if (wear) params.set('wear', String(wear));
    if (zip) params.set('zip', String(zip));

    // Prefer client-side navigation when JS is healthy; otherwise the plain GET submit still works.
    if (e?.preventDefault) {
      e.preventDefault();
    }
    router.push(`/evaluate?${params.toString()}`);
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      action="/evaluate"
      method="get"
      className="card space-y-4 p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="year" className="block text-xs font-medium text-slate-300">Year *</label>
          <input
            id="year"
            name="year"
            type="number"
            min="1980"
            max={new Date().getFullYear() + 1}
            required
            defaultValue={defaultYear}
            className={inputClass}
            placeholder="e.g. 2004"
          />
        </div>
        <div>
          <label htmlFor="make" className="block text-xs font-medium text-slate-300">Make *</label>
          <input
            id="make"
            name="make"
            type="text"
            required
            defaultValue={defaultMake}
            className={inputClass}
            placeholder="e.g. BMW"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="model" className="block text-xs font-medium text-slate-300">Model *</label>
          <input
            id="model"
            name="model"
            type="text"
            required
            defaultValue={defaultModel}
            className={inputClass}
            placeholder="e.g. 330Ci"
          />
        </div>
        <div>
          <label htmlFor="trim" className="block text-xs font-medium text-slate-300">Trim</label>
          <input
            id="trim"
            name="trim"
            type="text"
            defaultValue={defaultTrim}
            className={inputClass}
            placeholder="e.g. ZHP"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="mileage" className="block text-xs font-medium text-slate-300">Mileage *</label>
          <input
            id="mileage"
            name="mileage"
            type="number"
            min="0"
            required
            defaultValue={defaultMileage}
            className={inputClass}
            placeholder="e.g. 90000"
          />
        </div>
        <div>
          <label htmlFor="condition" className="block text-xs font-medium text-slate-300">Condition</label>
          <select id="condition" name="condition" defaultValue={defaultCondition ?? ''} className={inputClass}>
            <option value="">Select</option>
            <option value="excellent">Excellent</option>
            <option value="very_good">Very good</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="transmission" className="block text-xs font-medium text-slate-300">Transmission</label>
          <select
            id="transmission"
            name="transmission"
            defaultValue={defaultTransmission ?? ''}
            className={inputClass}
          >
            <option value="">Select</option>
            <option value="manual">Manual</option>
            <option value="automatic">Automatic</option>
            <option value="dct">DCT</option>
            <option value="cvt">CVT</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label htmlFor="color" className="block text-xs font-medium text-slate-300">Color</label>
          <input
            id="color"
            name="color"
            type="text"
            defaultValue={defaultColor}
            className={inputClass}
            placeholder="e.g. silver, black, red"
          />
        </div>
      </div>
      <div>
        <label htmlFor="mods" className="block text-xs font-medium text-slate-300">Mods / notable options</label>
        <input
          id="mods"
          name="mods"
          type="text"
          defaultValue={defaultMods}
          className={inputClass}
          placeholder="e.g. stock, coilovers, turbo, rust repair"
        />
      </div>
      <div>
        <label htmlFor="wear" className="block text-xs font-medium text-slate-300">Wear / issues</label>
        <textarea
          id="wear"
          name="wear"
          defaultValue={defaultWear}
          className={inputClass}
          rows={3}
          placeholder="e.g. needs tires, clear coat fading, convertible top worn, paint chips, brakes soon"
        />
      </div>
      <div>
        <label htmlFor="zip" className="block text-xs font-medium text-slate-300">ZIP</label>
        <input
          id="zip"
          name="zip"
          type="text"
          inputMode="numeric"
          required
          defaultValue={defaultZip}
          className={inputClass}
          placeholder="e.g. 92101"
        />
      </div>
      <button type="submit" className="btn-primary">
        Get valuation
      </button>
    </form>
  );
}
