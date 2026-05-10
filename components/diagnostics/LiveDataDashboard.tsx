'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { OBDClient } from '@/lib/obd/obdClient';
import { PID_DEFS, PID_MAP, CATEGORY_LABELS, type PIDCategory } from '@/lib/obd/pids';
import { SensorCard } from './SensorCard';

const HISTORY_LEN = 60;
const POLL_INTERVAL_MS = 80; // target ~12 cycles/sec; each PID ~80ms with ELM327 overhead

type SensorState = {
  value: number | null;
  history: number[];
  lastUpdated: number;
};

interface Props {
  client: OBDClient;
}

export function LiveDataDashboard({ client }: Props) {
  const [phase, setPhase] = useState<'discovering' | 'live' | 'error'>('discovering');
  const [supportedPIDs, setSupportedPIDs] = useState<number[]>([]);
  const [sensors, setSensors] = useState<Record<number, SensorState>>({});
  const [activeCategory, setActiveCategory] = useState<PIDCategory | 'all'>('all');
  const [isPaused, setIsPaused] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [cyclesPerSec, setCyclesPerSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const pausedRef = useRef(false);
  const runningRef = useRef(false);
  const cycleRef = useRef(0);
  const lastCycleTimeRef = useRef(Date.now());

  useEffect(() => {
    client.setDebugListener((msg) => {
      setDebugLog(prev => [...prev.slice(-7), msg]);
    });
    return () => client.setDebugListener(null);
  }, [client]);

  // ── Discovery ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function discover() {
      try {
        const supported = await client.discoverSupportedPIDs();
        if (cancelled) return;

        // Guarantee at minimum RPM + speed if nothing reported (some ECUs skip discovery)
        if (supported.size === 0) {
          [0x0C, 0x0D, 0x04, 0x05, 0x11].forEach(p => supported.add(p));
        }

        const pids = PID_DEFS.filter(d => supported.has(d.pid)).map(d => d.pid);
        setSupportedPIDs(pids);

        const initial: Record<number, SensorState> = {};
        for (const pid of pids) initial[pid] = { value: null, history: [], lastUpdated: 0 };
        setSensors(initial);
        setPhase('live');
      } catch (e: any) {
        if (!cancelled) {
          setErrorMsg(e?.message ?? 'Discovery failed');
          setPhase('error');
        }
      }
    }

    discover();
    return () => { cancelled = true; };
  }, [client]);

  // ── Polling loop ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'live' || supportedPIDs.length === 0) return;

    runningRef.current = true;
    let animFrame: number;

    const pidsByTier = [1, 2, 3, 4].map(t =>
      supportedPIDs.filter(pid => (PID_MAP.get(pid)?.tier ?? 4) === t)
    );

    async function pollCycle() {
      if (!runningRef.current) return;
      if (pausedRef.current) {
        animFrame = requestAnimationFrame(() => setTimeout(pollCycle, 200));
        return;
      }

      const cycle = cycleRef.current;
      const updates: Record<number, SensorState> = {};

      // Determine which PIDs to read this cycle based on tier
      const toRead: number[] = [
        ...pidsByTier[0],                              // tier 1: every cycle
        ...(cycle % 2 === 0 ? pidsByTier[1] : []),    // tier 2: every 2nd
        ...(cycle % 4 === 0 ? pidsByTier[2] : []),    // tier 3: every 4th
        ...(cycle % 8 === 0 ? pidsByTier[3] : []),    // tier 4: every 8th
      ];

      for (const pid of toRead) {
        if (!runningRef.current) break;
        const value = await client.readPID(pid);
        const now = Date.now();
        setSensors(prev => {
          const s = prev[pid] ?? { value: null, history: [], lastUpdated: 0 };
          const history = value !== null
            ? [...s.history.slice(-(HISTORY_LEN - 1)), value]
            : s.history;
          return { ...prev, [pid]: { value: value ?? s.value, history, lastUpdated: value !== null ? now : s.lastUpdated } };
        });
      }

      cycleRef.current = (cycle + 1) % 256;
      setCycleCount(c => c + 1);

      // Compute cycles/sec from elapsed time
      const now = Date.now();
      const elapsed = now - lastCycleTimeRef.current;
      if (elapsed > 0) setCyclesPerSec(+(1000 / elapsed).toFixed(1));
      lastCycleTimeRef.current = now;

      animFrame = requestAnimationFrame(() => setTimeout(pollCycle, POLL_INTERVAL_MS));
    }

    pollCycle();

    return () => {
      runningRef.current = false;
      cancelAnimationFrame(animFrame);
    };
  }, [phase, supportedPIDs, client]);

  // ── Pause toggle ──────────────────────────────────────────────────────────

  const togglePause = useCallback(() => {
    setIsPaused(p => {
      pausedRef.current = !p;
      return !p;
    });
  }, []);

  // ── Category filter ────────────────────────────────────────────────────────

  const availableCategories = Array.from(
    new Set(supportedPIDs.map(pid => PID_MAP.get(pid)?.category).filter(Boolean) as PIDCategory[])
  );

  const visiblePIDs = supportedPIDs.filter(pid => {
    if (activeCategory === 'all') return true;
    return PID_MAP.get(pid)?.category === activeCategory;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'discovering') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
        <p className="text-sm">Discovering supported sensors...</p>
        <p className="text-xs text-slate-600">Querying PID support bitmasks 00 / 20 / 40 / 60</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-400">
        {errorMsg || 'Failed to discover supported sensors.'}
      </div>
    );
  }

  const staleThreshold = 10_000; // 10s without update = stale

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-cyan-400 animate-pulse'}`} />
          <span className="text-xs text-slate-400">
            {isPaused ? 'Paused' : `${cyclesPerSec} cycles/s`}
          </span>
        </div>
        <span className="text-xs text-slate-600">{supportedPIDs.length} sensors</span>
        <span className="text-xs text-slate-600">cycle #{cycleCount}</span>
        <button
          onClick={togglePause}
          className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        {(['all', ...availableCategories] as Array<PIDCategory | 'all'>).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Sensor grid */}
      {visiblePIDs.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No sensors in this category.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visiblePIDs.map(pid => {
            const def = PID_MAP.get(pid)!;
            const s = sensors[pid];
            const isStale = s ? (Date.now() - s.lastUpdated > staleThreshold && s.lastUpdated > 0) : false;
            return (
              <SensorCard
                key={pid}
                def={def}
                value={s?.value ?? null}
                history={s?.history ?? []}
                isStale={isStale}
              />
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <div className="mb-1 text-[11px] font-medium text-slate-400">OBD Trace</div>
        <div className="space-y-0.5 font-mono text-[10px] text-slate-500">
          {debugLog.length === 0 ? (
            <div>Waiting for adapter traffic...</div>
          ) : (
            debugLog.map((line, i) => <div key={`${i}-${line}`}>{line}</div>)
          )}
        </div>
      </div>
    </div>
  );
}
