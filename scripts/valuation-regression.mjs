import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CACHE_DIR = path.join(__dirname, '.cache');
const BUILD_DIR = path.join(CACHE_DIR, 'valuation-build');

await mkdir(BUILD_DIR, { recursive: true });

function runTypeScriptBuild() {
  const binName = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
  const tscPath = path.join(PROJECT_ROOT, 'node_modules', '.bin', binName);
  const result = spawnSync(tscPath, ['-p', 'tsconfig.valuation-build.json'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error('Failed to compile valuation sources via tsc.');
  }
}

async function rewriteAliasImports(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await rewriteAliasImports(full);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    let content = await readFile(full, 'utf8');
    if (!content.includes('@/lib/')) continue;

    const relativeRoot = path.relative(path.dirname(full), BUILD_DIR).split(path.sep).join('/');
    const base = relativeRoot === '' ? '.' : relativeRoot;
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const replaced = content.replace(/(['"])@\/lib\/([^'"]+)/g, (_, quote, rest) => {
      return `${quote}${normalizedBase}${rest}`;
    });
    if (replaced !== content) {
      await writeFile(full, replaced, 'utf8');
    }
  }
}

runTypeScriptBuild();
await rewriteAliasImports(BUILD_DIR);

const engineModule = await import(pathToFileURL(path.join(BUILD_DIR, 'valuation', 'engine.js')).href);
const sourcesModule = await import(pathToFileURL(path.join(BUILD_DIR, 'sources', 'mock.js')).href);

const { computeDeterministicValuation, computeFallbackValuation } = engineModule;
const { fetchMockComps } = sourcesModule;

const BASELINE_PATH = path.join(__dirname, 'fixtures', 'valuation-baselines.json');

const VALUE_TOLERANCE = {
  value_low: 300,
  value_mid: 250,
  value_high: 350
};
const CONFIDENCE_TOLERANCE = 0.04;
const COMP_COUNT_TOLERANCE = 1;

const FIXTURES = [
  {
    name: 'bmw_e46_zhp',
    listing: {
      year: 2004,
      make: 'BMW',
      model: '330Ci',
      trim: 'ZHP',
      mileage: 86_000,
      state: 'TX',
      condition: 'very_good',
      transmission: 'manual',
      mods: 'Cooling system refresh',
      wear: 'Needs tires soon',
      vehicleKey: 'bmw_e46_330ci_zhp'
    },
    fetchComps: async () => {
      const comps = await fetchMockComps({ year: 2004, make: 'BMW', model: '330Ci', trim: 'ZHP' });
      return comps.map((comp) => {
        if (comp.trim && /zhp/i.test(comp.trim)) {
          return { ...comp, vehicleKey: 'bmw_e46_330ci_zhp' };
        }
        return comp;
      });
    }
  },
  {
    name: 'wrx_premium_manual',
    listing: {
      year: 2015,
      make: 'Subaru',
      model: 'WRX',
      trim: 'Premium',
      mileage: 76_000,
      state: 'TX',
      condition: 'good',
      transmission: 'manual',
      vehicleKey: 'subaru_wrx_premium_va'
    },
    fetchComps: async () => {
      const comps = await fetchMockComps({ year: 2015, make: 'Subaru', model: 'WRX', trim: 'Premium' });
      return comps.map((comp) => {
        if (comp.trim && /premium/i.test(comp.trim)) {
          return { ...comp, vehicleKey: 'subaru_wrx_premium_va' };
        }
        return comp;
      });
    }
  },
  {
    name: 'tacoma_trd_off_road',
    listing: {
      year: 2012,
      make: 'Toyota',
      model: 'Tacoma',
      trim: 'TRD Off Road',
      mileage: 118_000,
      state: 'TX',
      condition: 'very_good',
      vehicleKey: 'toyota_tacoma_trd_offroad_2nd'
    },
    fetchComps: async () => {
      const comps = await fetchMockComps({ year: 2012, make: 'Toyota', model: 'Tacoma', trim: 'TRD Off Road' });
      return comps.map((comp) => {
        if (comp.trim && /trd off road/i.test(comp.trim)) {
          return { ...comp, vehicleKey: 'toyota_tacoma_trd_offroad_2nd' };
        }
        return comp;
      });
    }
  },
  {
    name: 'lexus_gx470_high_miles',
    listing: {
      year: 2006,
      make: 'Lexus',
      model: 'GX470',
      mileage: 168_000,
      state: 'TX',
      condition: 'good',
      wear: 'Needs tires and has clear coat fade',
      vehicleKey: null
    },
    fetchComps: async () => fetchMockComps({ year: 2006, make: 'Lexus', model: 'GX470' })
  },
  {
    name: 'fallback_elise',
    listing: {
      year: 2005,
      make: 'Lotus',
      model: 'Elise',
      mileage: 52_000,
      state: 'CA',
      condition: 'very_good',
      transmission: 'manual'
    },
    fetchComps: async () => []
  }
];

async function loadBaseline() {
  try {
    const raw = await readFile(BASELINE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

async function saveBaseline(data) {
  await mkdir(path.dirname(BASELINE_PATH), { recursive: true });
  await writeFile(BASELINE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function cloneListing(listing) {
  return JSON.parse(JSON.stringify(listing));
}

function compareFixture(name, actual, expected) {
  const failures = [];
  for (const field of ['value_low', 'value_mid', 'value_high']) {
    const tolerance = VALUE_TOLERANCE[field];
    const delta = Math.abs(actual[field] - expected[field]);
    if (delta > tolerance) {
      failures.push(`${name} ${field} drifted by ${delta} (expected ${expected[field]}, got ${actual[field]})`);
    }
  }

  const confidenceDelta = Math.abs(actual.confidence - expected.confidence);
  if (confidenceDelta > CONFIDENCE_TOLERANCE) {
    failures.push(`${name} confidence drifted by ${confidenceDelta.toFixed(3)} (expected ${expected.confidence}, got ${actual.confidence})`);
  }

  const compDelta = Math.abs(actual.comp_count - expected.comp_count);
  if (compDelta > COMP_COUNT_TOLERANCE) {
    failures.push(`${name} comp_count drifted by ${compDelta} (expected ${expected.comp_count}, got ${actual.comp_count})`);
  }

  return failures;
}

async function main() {
  const updateMode = process.argv.includes('--update');
  const baseline = await loadBaseline();
  if (!updateMode && !baseline) {
    console.error('No valuation baseline found. Run with --update to seed baselines.');
    process.exit(1);
    return;
  }

  const results = {};
  const errors = [];

  for (const fixture of FIXTURES) {
    const listingInput = cloneListing(fixture.listing);
    const comps = await fixture.fetchComps(listingInput);
    const deterministic = computeDeterministicValuation(listingInput, comps);
    const valuation = deterministic ?? computeFallbackValuation(listingInput);
    const snapshot = {
      value_low: valuation.value_low,
      value_mid: valuation.value_mid,
      value_high: valuation.value_high,
      confidence: Number(valuation.confidence.toFixed(4)),
      comp_count: valuation.comp_count
    };
    results[fixture.name] = snapshot;

    if (!updateMode) {
      const expected = baseline?.[fixture.name];
      if (!expected) {
        errors.push(`Missing baseline entry for fixture ${fixture.name}`);
        continue;
      }
      const diff = compareFixture(fixture.name, snapshot, expected);
      errors.push(...diff);
    }
  }

  if (updateMode) {
    await saveBaseline(results);
    console.log(`Updated valuation baselines for ${FIXTURES.length} fixtures.`);
    return;
  }

  if (errors.length > 0) {
    console.error('Valuation regression failures:');
    for (const err of errors) {
      console.error(` - ${err}`);
    }
    process.exit(1);
    return;
  }

  console.log(`Valuation regression passed for ${FIXTURES.length} fixtures.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
