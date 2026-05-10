'use client';

import { useState, useRef } from 'react';
import type { DTC, DTCAnalysis, VehicleContext, OBDConnectionState } from '@/lib/obd/types';
import type { NhtsaDecodeResult } from '@/lib/vin/nhtsa';
import { parseDTCManual } from '@/lib/obd/elm327';
import { miToKm } from '@/lib/obd/maintenance';
import { DTCCard } from './DTCCard';
import { LiveDataDashboard } from './LiveDataDashboard';
import { NegotiationBrief } from './NegotiationBrief';
import { MaintenanceDue } from './MaintenanceDue';

async function getOBDClient() {
  const { OBDClient } = await import('@/lib/obd/obdClient');
  return OBDClient;
}

type Phase = 'setup' | 'connecting' | 'live' | 'manual';
type ResultsTab = 'faults' | 'live' | 'maintenance';

export function DiagnosticsPanel() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [conn, setConn] = useState<OBDConnectionState>({ status: 'disconnected' });
  const [connectStatus, setConnectStatus] = useState('');

  const [vehicle, setVehicle] = useState<VehicleContext>({ year: new Date().getFullYear(), make: '', model: '' });
  const [detectedVehicle, setDetectedVehicle] = useState<NhtsaDecodeResult | null>(null);
  const [mileageKm, setMileageKm] = useState<number | null>(null);
  const [mileageUnit, setMileageUnit] = useState<'km' | 'mi'>('km');

  const [vin, setVin] = useState<string | null>(null);
  const [dtcs, setDtcs] = useState<DTC[]>([]);
  const [analyses, setAnalyses] = useState<Map<string, DTCAnalysis>>(new Map());
  const [isScanning, setIsScanning] = useState(false);
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const [resultsTab, setResultsTab] = useState<ResultsTab>('live');
  const [manualInput, setManualInput] = useState('');
  const [copied, setCopied] = useState(false);

  const clientRef = useRef<InstanceType<Awaited<ReturnType<typeof getOBDClient>>> | null>(null);
  const cancelledRef = useRef(false);
  const vehicleRef = useRef(vehicle);
  vehicleRef.current = vehicle; // keep ref in sync with latest state


  // ── VIN decode & auto-fill ─────────────────────────────────────────────────

  async function autoDetectVehicle(client: NonNullable<typeof clientRef.current>) {
    const detectedVin = await client.readVIN().catch(() => null);
    if (cancelledRef.current) return;
    if (detectedVin) {
      setVin(detectedVin);
      try {
        const res = await fetch(`/api/vin/decode?vin=${detectedVin}`);
        const data = await res.json();
        // Use decoded data even when ok=false — partial decodes still have make/model
        const d: NhtsaDecodeResult | undefined = data.decoded;
        if (d && (d.make || d.modelYear)) {
          setDetectedVehicle(d);
          setVehicle(v => ({
            year: d.modelYear ?? v.year,
            make: d.make ?? v.make,
            model: d.model ?? v.model,
            trim: d.trim ?? v.trim,
            mileage: v.mileage,
          }));
        }
      } catch { /* ignore */ }
    }

    // Try odometer (PID 0xA6, 2010+ cars)
    const odomKm = await client.readOdometerKm().catch(() => null);
    if (cancelledRef.current) return;
    if (odomKm && odomKm > 0) {
      setMileageKm(odomKm);
      setVehicle(v => ({ ...v, mileage: odomKm }));
    }
  }

  // ── Shared: analyze codes and update state ─────────────────────────────────

  async function analyzeAndSet(codes: DTC[], currentVehicle: VehicleContext) {
    if (!codes.length || cancelledRef.current) return;
    setIsAnalyzing(true);
    setScanStatus(`Analyzing ${codes.length} code${codes.length !== 1 ? 's' : ''} with AI...`);
    try {
      const res = await fetch('/api/diagnostics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dtcs: codes.map(d => d.code), vehicle: currentVehicle }),
      });
      const data = await res.json();
      if (!cancelledRef.current) {
        if (data.warning) setWarning(data.warning);
        if (Array.isArray(data.analyses)) {
          const map = new Map<string, DTCAnalysis>();
          for (const a of data.analyses) map.set(a.code, a);
          setAnalyses(map);
        }
      }
    } catch {
      if (!cancelledRef.current) setWarning('Could not reach AI — showing code descriptions only.');
    } finally {
      if (!cancelledRef.current) setIsAnalyzing(false);
    }
  }

  // ── Quick scan: Mode 03/07/0A only (~5-10s) ────────────────────────────────

  async function quickScanBackground(client: NonNullable<typeof clientRef.current>, v: VehicleContext) {
    setIsScanning(true);
    setScanStatus('Reading fault codes...');
    try {
      const codes = await client.quickScan(msg => { if (!cancelledRef.current) setScanStatus(msg); });
      if (cancelledRef.current) return;
      setDtcs(codes);
      if (codes.length > 0) {
        setResultsTab('faults');
        await analyzeAndSet(codes, v);
      }
    } catch {
      if (!cancelledRef.current) setScanStatus('Quick scan failed.');
    } finally {
      if (!cancelledRef.current) setIsScanning(false);
    }
  }

  // ── Deep scan: full multi-ECU sweep (user-triggered) ──────────────────────

  async function deepScanBackground(client: NonNullable<typeof clientRef.current>, make: string, v: VehicleContext) {
    setIsDeepScanning(true);
    setScanStatus('Deep scanning all ECUs...');
    try {
      const codes = await client.comprehensiveScan(make || undefined, msg => { if (!cancelledRef.current) setScanStatus(msg); });
      if (cancelledRef.current) return;
      // Merge with any codes already found
      setDtcs(prev => {
        const merged = [...prev];
        for (const c of codes) {
          if (!merged.some(x => x.code === c.code)) merged.push(c);
        }
        return merged;
      });
      const newCodes = codes.filter(c => !dtcs.some(x => x.code === c.code));
      if (newCodes.length > 0) await analyzeAndSet(newCodes, v);
    } catch {
      if (!cancelledRef.current) setScanStatus('Deep scan failed.');
    } finally {
      if (!cancelledRef.current) setIsDeepScanning(false);
    }
  }

  // ── Connection helpers ─────────────────────────────────────────────────────

  async function afterConnect(client: NonNullable<typeof clientRef.current>, method: 'bluetooth' | 'serial') {
    cancelledRef.current = false;
    clientRef.current = client;
    setConn({ status: 'connected', method, deviceName: client.deviceName ?? undefined });
    setPhase('live');
    setResultsTab('live');

    // Wait for React to render LiveDataDashboard and its useEffect to queue PID discovery.
    // Without this delay, VIN commands would queue BEFORE PID discovery commands — blocking
    // live sensor data for up to 4.5 extra seconds while the adapter reads the VIN.
    await new Promise<void>(r => setTimeout(r, 50));
    if (cancelledRef.current) return;

    // Queue order through OBDClient's single-threaded command queue:
    //  1. PID discovery (already queued by LiveDataDashboard useEffect above)
    //  2. VIN + odometer — auto-fills vehicle form, non-blocking for live data
    //  3. Quick Mode 03/07/0A DTC scan (~5-10s)
    autoDetectVehicle(client);
    setTimeout(() => {
      if (!cancelledRef.current) quickScanBackground(client, vehicleRef.current);
    }, 100);
  }

  async function connectBluetooth() {
    cancelledRef.current = false;
    setPhase('connecting');
    setConn({ status: 'connecting', method: 'bluetooth' });
    try {
      const OBDClient = await getOBDClient();
      const client = new OBDClient();
      // Auto path: many "Bluetooth ELM327" adapters are actually Classic/SPP and
      // are more reliable via Web Serial than Web Bluetooth GATT in desktop browsers.
      try {
        setConnectStatus('Trying previously authorized serial transport...');
        await client.connectSerial(msg => { if (!cancelledRef.current) setConnectStatus(msg); }, { interactive: false });
        if (cancelledRef.current) return;
        await afterConnect(client, 'serial');
        return;
      } catch (serialErr) {
        if (cancelledRef.current) return;
        const serialMsg = serialErr instanceof Error ? serialErr.message : 'Serial connection failed';
        try {
          setConnectStatus('Serial failed. Trying BLE transport...');
          await client.connectBluetooth(msg => { if (!cancelledRef.current) setConnectStatus(msg); });
          if (cancelledRef.current) return;
          await afterConnect(client, 'bluetooth');
          return;
        } catch (bleErr) {
          if (cancelledRef.current) return;
          const bleMsg = bleErr instanceof Error ? bleErr.message : 'Bluetooth connection failed';
          setConn({
            status: 'error',
            method: 'bluetooth',
            error: `Auto-connect failed. Serial: ${serialMsg}. BLE: ${bleMsg}. If this adapter is Classic/SPP, click USB/Serial and approve the port picker once.`,
          });
          setPhase('setup');
          return;
        }
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setConn({ status: 'error', method: 'bluetooth', error: err instanceof Error ? err.message : 'Connection failed' });
      setPhase('setup');
    }
  }

  async function connectSerial() {
    cancelledRef.current = false;
    setPhase('connecting');
    setConn({ status: 'connecting', method: 'serial' });
    try {
      const OBDClient = await getOBDClient();
      const client = new OBDClient();
      await client.connectSerial(msg => { if (!cancelledRef.current) setConnectStatus(msg); });
      if (cancelledRef.current) return;
      await afterConnect(client, 'serial');
    } catch (err) {
      if (cancelledRef.current) return;
      setConn({ status: 'error', method: 'serial', error: err instanceof Error ? err.message : 'Connection failed' });
      setPhase('setup');
    }
  }

  // ── Manual entry ───────────────────────────────────────────────────────────

  async function submitManual() {
    const codes = parseDTCManual(manualInput);
    if (!codes.length) return;
    setDtcs(codes);
    setIsAnalyzing(true);
    setResultsTab('faults');
    setPhase('live');
    setScanStatus(`Analyzing ${codes.length} code${codes.length !== 1 ? 's' : ''} with AI...`);
    try {
      const res = await fetch('/api/diagnostics/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dtcs: codes.map(d => d.code), vehicle }),
      });
      const data = await res.json();
      if (data.warning) setWarning(data.warning);
      if (Array.isArray(data.analyses)) {
        const map = new Map<string, DTCAnalysis>();
        for (const a of data.analyses) map.set(a.code, a);
        setAnalyses(map);
      }
    } catch {
      setWarning('Could not reach AI — showing code descriptions only.');
    } finally {
      setIsAnalyzing(false);
      setScanStatus('');
    }
  }

  // ── Share report ───────────────────────────────────────────────────────────

  function buildReport(): string {
    const car = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ' ' + vehicle.trim : ''}`;
    const lines: string[] = [
      `OBD-II Diagnostic Report — ${car}`,
      vin ? `VIN: ${vin}` : '',
      mileageKm ? `Odometer: ${mileageKm.toLocaleString()} km (${Math.round(mileageKm / 1.60934).toLocaleString()} mi)` : '',
      `Scanned: ${new Date().toLocaleDateString()}`,
      '',
    ];

    if (dtcs.length === 0) {
      lines.push('No fault codes detected.');
    } else {
      lines.push(`Fault Codes (${dtcs.length}):`);
      for (const d of dtcs) {
        const a = analyses.get(d.code);
        lines.push(`  ${d.code}${d.description ? ' — ' + d.description : ''}${d.ecuName ? ' [' + d.ecuName + ']' : ''}`);
        if (a) {
          lines.push(`    Severity: ${a.severity}`);
          lines.push(`    ${a.explanation}`);
        }
      }
    }

    // Repair cost summary
    if (analyses.size > 0) {
      let totalMin = 0, totalMax = 0;
      for (const a of Array.from(analyses.values())) {
        for (const fix of a.fixes) {
          const nums = fix.estimatedCost.replace(/,/g, '').match(/\d+/g)?.map(Number) ?? [];
          if (nums.length === 1) { totalMin += nums[0]; totalMax += nums[0]; }
          if (nums.length >= 2) { totalMin += Math.min(...nums); totalMax += Math.max(...nums); }
        }
      }
      if (totalMax > 0) {
        lines.push('', `Estimated Repair Total: $${totalMin}–$${totalMax}`);
      }
    }

    lines.push('', 'Generated with Axle Diagnostics — axle.app');
    return lines.filter(l => l !== null && l !== undefined).join('\n');
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard denied */ }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  function cancel() {
    cancelledRef.current = true;
    clientRef.current?.disconnect();
    clientRef.current = null;
    setPhase('setup');
    setConn(prev => ({ ...prev, status: 'disconnected', error: undefined }));
    setConnectStatus('');
  }

  function reset() {
    cancelledRef.current = true;
    clientRef.current?.disconnect();
    clientRef.current = null;
    setPhase('setup');
    setConn({ status: 'disconnected' });
    setDtcs([]);
    setAnalyses(new Map());
    setWarning(null);
    setVin(null);
    setDetectedVehicle(null);
    setMileageKm(null);
    setManualInput('');
    setConnectStatus('');
    setScanStatus('');
    setIsScanning(false);
    setIsAnalyzing(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const hasLiveClient = phase === 'live' && !!clientRef.current;
  const hasMileage = mileageKm !== null && mileageKm > 0;

  const visibleTabs: Array<{ id: ResultsTab; label: string }> = [
    { id: 'faults', label: `Fault Codes${dtcs.length > 0 ? ` (${dtcs.length})` : ''}` },
    ...(hasLiveClient ? [{ id: 'live' as ResultsTab, label: 'Live Data' }] : []),
    ...(hasMileage ? [{ id: 'maintenance' as ResultsTab, label: 'Maintenance' }] : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 w-full">

      {/* Vehicle form */}
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Your Vehicle</h2>
          {detectedVehicle && (
            <span className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
              Auto-detected from OBD
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <input
            type="number" placeholder="Year"
            min={1996} max={new Date().getFullYear() + 1}
            value={vehicle.year || ''}
            onChange={e => setVehicle(v => ({ ...v, year: parseInt(e.target.value) || 0 }))}
            className="col-span-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            disabled={phase === 'connecting'}
          />
          <input
            type="text" placeholder="Make"
            value={vehicle.make}
            onChange={e => setVehicle(v => ({ ...v, make: e.target.value }))}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            disabled={phase === 'connecting'}
          />
          <input
            type="text" placeholder="Model"
            value={vehicle.model}
            onChange={e => setVehicle(v => ({ ...v, model: e.target.value }))}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            disabled={phase === 'connecting'}
          />
          <input
            type="text" placeholder="Trim (optional)"
            value={vehicle.trim ?? ''}
            onChange={e => setVehicle(v => ({ ...v, trim: e.target.value }))}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            disabled={phase === 'connecting'}
          />
          <div className="flex gap-1.5">
            <input
              type="number" placeholder="Mileage"
              min={0}
              value={mileageKm !== null ? (mileageUnit === 'km' ? mileageKm : Math.round(mileageKm / 1.60934)) : (vehicle.mileage ?? '')}
              onChange={e => {
                const val = parseInt(e.target.value) || 0;
                const km = mileageUnit === 'mi' ? miToKm(val) : val;
                setMileageKm(km);
                setVehicle(v => ({ ...v, mileage: km }));
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              disabled={phase === 'connecting'}
            />
            <button
              onClick={() => setMileageUnit(u => u === 'km' ? 'mi' : 'km')}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs text-slate-400 hover:text-white"
            >
              {mileageUnit}
            </button>
          </div>
        </div>

        {/* OBD-detected engine info */}
        {detectedVehicle && (detectedVehicle.engineCylinders || detectedVehicle.engineDisplacementL || detectedVehicle.fuelTypePrimary) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {detectedVehicle.engineDisplacementL && (
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {detectedVehicle.engineDisplacementL}L
              </span>
            )}
            {detectedVehicle.engineCylinders && (
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {detectedVehicle.engineCylinders}-cylinder
              </span>
            )}
            {detectedVehicle.fuelTypePrimary && (
              <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                {detectedVehicle.fuelTypePrimary}
              </span>
            )}
            {mileageKm && (
              <span className="rounded bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 text-xs text-cyan-300">
                {mileageKm.toLocaleString()} km from OBD
              </span>
            )}
          </div>
        )}

        {vehicle.year < 1996 && vehicle.year > 0 && (
          <p className="mt-2 text-xs text-yellow-400">OBD-II is only required on 1996+ vehicles.</p>
        )}
      </section>

      {/* Connect panel */}
      {phase === 'setup' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Connect OBD-II Scanner</h2>

          {conn.error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {conn.error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              onClick={connectBluetooth}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-5 text-sm transition-colors hover:border-cyan-500/50 hover:bg-slate-700"
            >
              <svg className="h-7 w-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L18 9l-4.5 4.5 4.5 4.5-4.5 4.5V4.5zM6 9l4.5 4.5L6 18" />
              </svg>
              <span className="font-semibold text-white">Bluetooth BLE</span>
              <span className="text-center text-xs text-slate-400">Wireless ELM327 adapter</span>
            </button>

            <button
              onClick={connectSerial}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-5 text-sm transition-colors hover:border-cyan-500/50 hover:bg-slate-700"
            >
              <svg className="h-7 w-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              </svg>
              <span className="font-semibold text-white">USB / Serial</span>
              <span className="text-center text-xs text-slate-400">Wired ELM327 adapter</span>
            </button>

            <button
              onClick={() => setPhase('manual')}
              className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-5 text-sm transition-colors hover:border-cyan-500/50 hover:bg-slate-700"
            >
              <svg className="h-7 w-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              <span className="font-semibold text-white">Enter Manually</span>
              <span className="text-center text-xs text-slate-400">Already have the codes</span>
            </button>
          </div>

          <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300">No details needed.</strong> Connect your adapter and your vehicle details (make, model, mileage) are read automatically from the OBD port. You can also fill them in above if you prefer.
          </div>
        </section>
      )}

      {/* Manual input */}
      {phase === 'manual' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Enter Diagnostic Codes</h2>
          <p className="text-sm text-slate-400">Paste or type your DTC codes, separated by commas or spaces.</p>
          <input
            type="text" placeholder="P0301, P0420, C0040..."
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitManual()}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            autoFocus
          />
          <div className="flex gap-3">
            <button
              onClick={submitManual}
              disabled={!parseDTCManual(manualInput).length}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Analyze Codes
            </button>
            <button onClick={() => setPhase('setup')} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 transition-colors">
              Back
            </button>
          </div>
        </section>
      )}

      {/* Connecting spinner */}
      {phase === 'connecting' && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
            <div>
              <p className="text-sm font-medium text-slate-200">Connecting to adapter</p>
              {connectStatus && <p className="mt-1 text-xs text-slate-400">{connectStatus}</p>}
            </div>
            <button
              onClick={cancel}
              className="mt-2 rounded-lg border border-slate-700 px-4 py-1.5 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Live results */}
      {phase === 'live' && (
        <section className="space-y-4">
          {/* Session header */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
            <div className="flex-1">
              <div className="font-semibold">
                {vehicle.year} {vehicle.make} {vehicle.model} {vehicle.trim ?? ''}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {conn.deviceName && <span>{conn.deviceName}</span>}
                {vin && <span>· VIN {vin}</span>}
                {mileageKm && <span>· {mileageKm.toLocaleString()} km</span>}
                {isScanning && (
                  <span className="flex items-center gap-1 text-cyan-400">
                    <span className="inline-block h-2 w-2 animate-spin rounded-full border border-cyan-400 border-t-transparent" />
                    {scanStatus || 'Scanning...'}
                  </span>
                )}
                {isAnalyzing && !isScanning && (
                  <span className="flex items-center gap-1 text-purple-400">
                    <span className="inline-block h-2 w-2 animate-spin rounded-full border border-purple-400 border-t-transparent" />
                    Analyzing with AI...
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              {clientRef.current && !isDeepScanning && !isScanning && (
                <button
                  onClick={() => deepScanBackground(clientRef.current!, vehicleRef.current.make, vehicleRef.current)}
                  className="rounded-lg border border-cyan-700/50 bg-cyan-900/20 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-900/40 transition-colors"
                >
                  Deep Scan
                </button>
              )}
              {isDeepScanning && (
                <span className="flex items-center gap-1.5 rounded-lg border border-cyan-700/30 px-3 py-1.5 text-xs text-cyan-400">
                  <span className="inline-block h-2 w-2 animate-spin rounded-full border border-cyan-400 border-t-transparent" />
                  {scanStatus || 'Deep scanning...'}
                </span>
              )}
              {dtcs.length > 0 && (
                <button
                  onClick={copyReport}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 transition-colors"
                >
                  {copied ? '✓ Copied' : 'Share Report'}
                </button>
              )}
              <button
                onClick={reset}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>

          {/* Tab bar */}
          {visibleTabs.length > 1 && (
            <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
              {visibleTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setResultsTab(tab.id)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                    resultsTab === tab.id
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {warning && resultsTab === 'faults' && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
              {warning}
            </div>
          )}

          {/* Fault codes tab */}
          {resultsTab === 'faults' && (
            <div className="space-y-4">
              {isScanning && dtcs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
                  <p className="text-sm">{scanStatus || 'Scanning all ECUs...'}</p>
                </div>
              ) : dtcs.length === 0 ? (
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-8 text-center">
                  <div className="text-2xl mb-2">✓</div>
                  <p className="text-green-400 font-semibold">No fault codes detected</p>
                  <p className="mt-1 text-sm text-slate-400">Your vehicle is not reporting any active fault codes.</p>
                </div>
              ) : (
                <>
                  {analyses.size > 0 && (
                    <NegotiationBrief
                      analyses={Array.from(analyses.values())}
                      onCopy={copyReport}
                      copied={copied}
                    />
                  )}
                  <div className="space-y-4">
                    {dtcs.map(dtc => (
                      <DTCCard
                        key={dtc.code}
                        dtc={dtc}
                        analysis={analyses.get(dtc.code) ?? null}
                        isLoading={isAnalyzing}
                        vehicle={vehicle}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Live data tab — always keep mounted so discovery doesn't re-run on tab switch */}
          <div className={resultsTab !== 'live' ? 'hidden' : ''}>
            {clientRef.current && <LiveDataDashboard client={clientRef.current} />}
          </div>

          {/* Maintenance tab */}
          {resultsTab === 'maintenance' && hasMileage && (
            <MaintenanceDue mileageKm={mileageKm!} />
          )}
        </section>
      )}
    </div>
  );
}
