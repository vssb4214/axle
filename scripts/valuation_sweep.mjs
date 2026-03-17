import 'dotenv/config';

// Use IPv4 loopback by default to avoid environments where `localhost` resolves to ::1.
const BASE = process.env.SWEEP_BASE_URL || 'http://127.0.0.1:3001';

const CASES = [
  {
    label: '2013 Sienna XLE low miles',
    q: {
      year: 2013,
      make: 'Toyota',
      model: 'Sienna',
      trim: 'XLE',
      mileage: 42000,
      zip: '94598',
      condition: 'excellent',
      transmission: 'automatic',
      wear: 'missing rear view mirror'
    }
  },
  {
    label: '2012 Prius LE higher miles',
    q: {
      year: 2012,
      make: 'Toyota',
      model: 'Prius',
      trim: 'LE',
      mileage: 140000,
      zip: '92101',
      condition: 'good',
      transmission: 'automatic',
      wear: 'bad tires; cracked tail light'
    }
  },
  {
    label: '2004 BMW Z4 3.0 (enthusiast)',
    q: {
      year: 2004,
      make: 'BMW',
      model: 'Z4',
      trim: '3.0',
      mileage: 139000,
      zip: '94598',
      condition: 'good',
      transmission: 'automatic',
      mods: 'BlueBus; cooling system refresh; full brake service',
      wear: 'torn seats; clear coat peeling'
    }
  }
];

function qs(q) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null || v === '') continue;
    p.set(k, String(v));
  }
  return p.toString();
}

function extract(html) {
  const out = {};
  const mComp = html.match(/(\d+)<!-- --> comparables/);
  if (mComp) out.comp_count = Number(mComp[1]);

  const mRange = html.match(/\$<!-- -->([0-9,]+)<!-- -->[^$]*\$<!-- -->([0-9,]+)<!-- -->/);
  if (mRange) {
    out.low = Number(mRange[1].replace(/,/g, ''));
    out.high = Number(mRange[2].replace(/,/g, ''));
  }
  const mMid = html.match(/Mid:\s*\$<!-- -->([0-9,]+)/);
  if (mMid) out.mid = Number(mMid[1].replace(/,/g, ''));

  const mSources = html.match(/Sources used:\s*<!-- -->([^<]+)<!-- -->\./);
  if (mSources) out.sources = mSources[1];

  const mUnavailable = html.match(/Some sources unavailable:[^<]*/);
  if (mUnavailable) out.unavailable = mUnavailable[0];

  return out;
}

for (const c of CASES) {
  const url = `${BASE}/evaluate?${qs(c.q)}`;
  console.log(`\n== ${c.label} ==`);
  console.log(url);

  let html = '';
  try {
    const ctrl = new AbortController();
    const fetchPromise = (async () => {
      const res = await fetch(url, { signal: ctrl.signal });
      return await res.text();
    })();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout after 30s')), 30000));
    html = await Promise.race([fetchPromise, timeoutPromise]);
    ctrl.abort();
  } catch (e) {
    console.log({ error: String(e) });
    continue;
  }

  const s = extract(html);
  console.log(s);
}

