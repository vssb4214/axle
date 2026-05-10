// Browser-only — never import from server-side code.
import {
  parseDTCResponse,
  parseUDSResponse,
  parseVINResponse,
  getECUScanList,
  ECU_NAMES,
  deduplicateDTCs,
  READ_DTC_CMD,
  READ_PENDING_CMD,
  READ_PERMANENT_CMD,
  READ_VIN_CMD,
  parseHexBytes,
} from './elm327';
import type { DTC } from './types';
import { PID_MAP, SUPPORT_PIDS } from './pids';

// ELM327 BLE GATT configurations — tried in order until one succeeds.
const BLE_CONFIGS = [
  {
    // HM-10 / most common cheap ELM327 BLE adapters
    serviceUUID: '0000ffe0-0000-1000-8000-00805f9b34fb',
    writeUUID:   '0000ffe1-0000-1000-8000-00805f9b34fb',
    notifyUUID:  '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
  {
    // FFF0 service variant (Vgate iCar Pro, some generics)
    serviceUUID: '0000fff0-0000-1000-8000-00805f9b34fb',
    writeUUID:   '0000fff2-0000-1000-8000-00805f9b34fb',
    notifyUUID:  '0000fff1-0000-1000-8000-00805f9b34fb',
  },
  {
    // FFF0 single-characteristic variant (many low-cost clones)
    serviceUUID: '0000fff0-0000-1000-8000-00805f9b34fb',
    writeUUID:   '0000fff1-0000-1000-8000-00805f9b34fb',
    notifyUUID:  '0000fff1-0000-1000-8000-00805f9b34fb',
  },
  {
    // Nordic UART Service (NUS) — Carista, newer adapters
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    writeUUID:   '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    notifyUUID:  '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  },
  {
    // Viecar / Kiwi adapters
    serviceUUID: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    writeUUID:   'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    notifyUUID:  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  },
  {
    // Some adapters use this TI/CC254x-style custom serial service.
    serviceUUID: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    writeUUID:   '49535343-8841-43f4-a8d4-ecbe34729bb3',
    notifyUUID:  '49535343-1e4d-4bd9-ba61-23c647249616',
  },
];

export class OBDClient {
  private bleDevice: any = null;
  private bleWriteChar: any = null;
  private serialPort: any = null;
  private serialWriter: any = null;
  private serialReader: any = null;

  private responseBuffer = '';
  private responseResolver: ((r: string) => void) | null = null;
  private responseRejecter: ((e: Error) => void) | null = null;

  // Serializes all OBD commands — ELM327 is single-threaded; concurrent sends corrupt each other.
  // priority > 0 items jump ahead of priority-0 items (live PIDs use 1, scan commands use 0).
  private cmdQueue: Array<{ fn: () => Promise<void>; priority: number }> = [];
  private cmdRunning = false;
  private mode01Format: 'compact' | 'spaced' = 'compact';
  private lineEnding: '\r' | '\r\n' = '\r';
  private debugListener: ((msg: string) => void) | null = null;

  public method: 'bluetooth' | 'serial' | null = null;
  public deviceName: string | null = null;
  public isConnected = false;

  // ─── Connection ────────────────────────────────────────────────────────────

  async connectBluetooth(onStatus?: (msg: string) => void): Promise<void> {
    const bt = (navigator as any).bluetooth;
    if (!bt) throw new Error('Web Bluetooth is not supported. Use Chrome or Edge.');

    onStatus?.('Opening Bluetooth device picker...');
    const optionalServices = BLE_CONFIGS.map(c => c.serviceUUID);
    let device: any;
    try {
      device = await bt.requestDevice({
        filters: [
          { namePrefix: 'OBDII' }, { namePrefix: 'OBD' }, { namePrefix: 'ELM327' },
          { namePrefix: 'V-Link' }, { namePrefix: 'Kiwi' }, { namePrefix: 'OBD2' },
          { namePrefix: 'Veepeak' }, { namePrefix: 'VGATE' }, { namePrefix: 'iCar' },
          { namePrefix: 'Carista' },
        ],
        optionalServices,
      });
    } catch {
      // Some adapters advertise unexpected names; allow a broad pick fallback.
      device = await bt.requestDevice({
        acceptAllDevices: true,
        optionalServices,
      });
    }

    this.bleDevice = device;
    this.deviceName = device.name ?? 'OBD-II Scanner';

    onStatus?.(`Connecting to ${this.deviceName}...`);
    const server = await device.gatt.connect();

    onStatus?.('Discovering OBD-II service...');
    for (const cfg of BLE_CONFIGS) {
      try {
        const service    = await server.getPrimaryService(cfg.serviceUUID);
        const notifyChar = await service.getCharacteristic(cfg.notifyUUID);
        const writeChar  = await service.getCharacteristic(cfg.writeUUID);

        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', this.handleBLEData);

        this.bleWriteChar = writeChar;
        this.method = 'bluetooth';
        this.isConnected = true;

        await this.initELM327(onStatus);
        return;
      } catch { /* try next config */ }
    }

    // Fallback: some adapters use odd characteristic UUIDs under a known service.
    // Scan available characteristics and pick a write + notify pair dynamically.
    for (const cfg of BLE_CONFIGS) {
      try {
        const service = await server.getPrimaryService(cfg.serviceUUID);
        const chars = await service.getCharacteristics();

        const notifyChar = chars.find((c: any) =>
          c?.properties?.notify || c?.properties?.indicate
        );
        const writeChar = chars.find((c: any) =>
          c?.properties?.writeWithoutResponse || c?.properties?.write
        );

        if (!notifyChar || !writeChar) continue;

        await notifyChar.startNotifications();
        notifyChar.addEventListener('characteristicvaluechanged', this.handleBLEData);

        this.bleWriteChar = writeChar;
        this.method = 'bluetooth';
        this.isConnected = true;

        await this.initELM327(onStatus);
        return;
      } catch { /* try next service */ }
    }

    // Fallback for Bluetooth Classic SPP adapters: use Web Serial over RFCOMM (Chrome 117+ desktop).
    onStatus?.('BLE GATT not found; trying Bluetooth serial profile...');
    const serial = (navigator as any).serial;
    const sppId = '00001101-0000-1000-8000-00805f9b34fb';
    if (serial?.requestPort) {
      try {
        let port: any = null;
        try {
          port = await serial.requestPort({
            allowedBluetoothServiceClassIds: [sppId],
            filters: [{ bluetoothServiceClassId: sppId }],
          });
        } catch {
          // Some desktop stacks expose BT serial without SPP class metadata.
          port = await serial.requestPort();
        }
        await this.openSerialWithFallbackBaud(port, onStatus);
        this.serialPort = port;
        this.serialWriter = port.writable.getWriter();
        this.serialReader = port.readable.getReader();
        this.method = 'serial';
        this.deviceName = device?.name ?? 'Bluetooth SPP OBD-II Adapter';
        this.isConnected = true;
        this.drainSerialLoop();
        await this.initELM327(onStatus);
        return;
      } catch {
        // Keep final error below.
      }
    }

    throw new Error('Could not find BLE GATT OBD service. Adapter may be Bluetooth Classic/SPP. Pair in OS, then use USB/Serial (grant browser serial access).');
  }

  async connectSerial(onStatus?: (msg: string) => void, opts?: { interactive?: boolean }): Promise<void> {
    const serial = (navigator as any).serial;
    if (!serial) throw new Error('Web Serial is not supported. Use Chrome or Edge on desktop.');
    const interactive = opts?.interactive ?? true;

    let port: any = null;
    const existingPorts = await serial.getPorts?.().catch(() => []) ?? [];
    for (const p of existingPorts) {
      try {
        await this.openSerialWithFallbackBaud(p, onStatus);
        port = p;
        break;
      } catch {
        // Try next remembered port.
      }
    }

    if (!port && interactive) {
      onStatus?.('Select your USB/Bluetooth serial OBD-II adapter from the list...');
      port = await serial.requestPort();
      await this.openSerialWithFallbackBaud(port, onStatus);
    }
    if (!port) {
      throw new Error('No previously authorized serial OBD port found. Open USB/Serial once and select your adapter.');
    }

    this.serialPort   = port;
    this.serialWriter = port.writable.getWriter();
    this.serialReader = port.readable.getReader();
    this.method       = 'serial';
    this.deviceName   = 'USB OBD-II Adapter';
    this.isConnected  = true;

    this.drainSerialLoop();
    await this.initELM327(onStatus);
  }

  private async openSerialWithFallbackBaud(port: any, onStatus?: (msg: string) => void): Promise<void> {
    const baudCandidates = [38400, 9600, 115200, 57600];
    let lastErr: unknown = null;
    for (const baudRate of baudCandidates) {
      try {
        onStatus?.(`Opening serial port at ${baudRate} baud...`);
        await port.open({ baudRate });
        return;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Failed to open serial port at common ELM327 baud rates.');
  }

  // ─── Internal transport ────────────────────────────────────────────────────

  private handleBLEData = (event: Event) => {
    const char = event.target as any;
    this.consumeChunk(new TextDecoder().decode(char.value));
  };

  private async drainSerialLoop() {
    try {
      while (this.serialReader) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        this.consumeChunk(new TextDecoder().decode(value));
      }
    } catch { /* port closed */ }
  }

  private consumeChunk(chunk: string) {
    this.responseBuffer += chunk;
    if (this.responseBuffer.includes('>') && this.responseResolver) {
      const response = this.responseBuffer.replace('>', '').trim();
      this.responseBuffer = '';
      const resolve = this.responseResolver;
      this.responseResolver = null;
      this.responseRejecter = null;
      resolve(response);
    }
  }

  // Public API: enqueues the command and waits for it to run in-order.
  // priority=1 items (live data PIDs) jump ahead of priority=0 items (scans, VIN, etc.)
  // so live sensor updates are never blocked by a long-running DTC scan.
  sendCommand(cmd: string, timeoutMs = 5000, priority = 0): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const item = { fn: () => this.sendCommandDirect(cmd, timeoutMs).then(resolve, reject), priority };
      const insertAt = this.cmdQueue.findIndex(q => q.priority < item.priority);
      if (insertAt >= 0) this.cmdQueue.splice(insertAt, 0, item);
      else this.cmdQueue.push(item);
      if (!this.cmdRunning) this.drainCmdQueue();
    });
  }

  private async drainCmdQueue() {
    this.cmdRunning = true;
    try {
      while (this.cmdQueue.length > 0) {
        const { fn } = this.cmdQueue.shift()!;
        // Errors routed to each caller's own reject — never break the drain loop.
        try { await fn(); } catch { /* caller's promise already rejected */ }
      }
    } finally {
      this.cmdRunning = false;
    }
  }

  private async sendCommandDirect(cmd: string, timeoutMs = 5000): Promise<string> {
    if (!this.isConnected) throw new Error('OBD adapter not connected');
    const startedAt = Date.now();
    const endings: Array<'\r' | '\r\n'> = this.lineEnding === '\r' ? ['\r', '\r\n'] : ['\r\n', '\r'];

    for (let i = 0; i < endings.length; i++) {
      const ending = endings[i];
      this.responseBuffer = '';

      const responsePromise = new Promise<string>((resolve, reject) => {
        this.responseResolver = resolve;
        this.responseRejecter = reject;
        setTimeout(() => {
          if (this.responseRejecter === reject) {
            this.responseResolver = null;
            this.responseRejecter = null;
            reject(new Error(`Timeout: "${cmd}"`));
          }
        }, timeoutMs);
      });

      const bytes = new TextEncoder().encode(cmd + ending);
      if (this.method === 'bluetooth' && this.bleWriteChar) {
        try { await this.bleWriteChar.writeValueWithoutResponse(bytes); }
        catch { await this.bleWriteChar.writeValue(bytes); }
      } else if (this.method === 'serial' && this.serialWriter) {
        await this.serialWriter.write(bytes);
      }

      try {
        const res = await responsePromise;
        this.lineEnding = ending;
        this.debugListener?.(
          `[${Date.now() - startedAt}ms] ${cmd} => ${res.replace(/\s+/g, ' ').trim().slice(0, 140)}`
        );
        return res;
      } catch (err) {
        if (i === endings.length - 1) {
          this.debugListener?.(`[timeout] ${cmd}`);
          throw err;
        }
      }
    }

    throw new Error(`Timeout: "${cmd}"`);
  }

  private async initELM327(onStatus?: (msg: string) => void): Promise<void> {
    onStatus?.('Resetting ELM327 adapter...');
    await this.sendCommand('ATZ', 3000).catch(() => {});
    await delay(1000);

    onStatus?.('Verifying adapter link...');
    const adapterInfo = await this.sendCommand('ATI', 2500).catch(() => '');
    if (!adapterInfo) {
      throw new Error('Connected to Bluetooth device, but no ELM327 response. Check adapter compatibility.');
    }

    onStatus?.('Configuring adapter settings...');
    for (const cmd of ['ATE0', 'ATL0', 'ATS1', 'ATH0', 'ATAT2', 'ATSP0']) {
      await this.sendCommand(cmd, 3000).catch(() => {});
      await delay(150);
    }
    // Trigger protocol negotiation now (ATSP0 defers it to the first OBD command).
    // With a 5s window the ELM327 can cycle through K-Line / ISO 9141 / CAN variants.
    // Without this, the first discovery command times out at 2s and the car appears to
    // support no PIDs, leaving live data on a 5-sensor fallback with null values.
    onStatus?.('Negotiating vehicle protocol...');
    const protocolReady = await this.negotiateProtocol();
    if (!protocolReady) {
      throw new Error('Adapter connected, but no OBD-II response from vehicle ECU.');
    }
    onStatus?.('Adapter ready');
  }

  private async negotiateProtocol(): Promise<boolean> {
    const attempts = [6000, 9000, 12000];
    for (const timeoutMs of attempts) {
      try {
        const cmd = this.mode01Format === 'compact' ? '0100' : '01 00';
        const res = await this.sendCommand(cmd, timeoutMs);
        // Accept the negotiation only when we receive a normal Mode 01 response.
        if (/41\s*00|4100/i.test(res)) return true;
      } catch {
        // Retry with a longer timeout.
      }
      await delay(250);
    }

    // Format auto-detect fallback for quirky adapters.
    try {
      const compact = await this.sendCommand('0100', 4000);
      if (/41\s*00|4100/i.test(compact)) {
        this.mode01Format = 'compact';
        return true;
      }
    } catch { /* try spaced */ }
    try {
      const spaced = await this.sendCommand('01 00', 4000);
      if (/41\s*00|4100/i.test(spaced)) {
        this.mode01Format = 'spaced';
        return true;
      }
    } catch { /* keep current */ }

    // Auto protocol can fail on some vehicles/adapters.
    // 2004 BMWs are typically ISO/KWP on K-line, so try those first.
    for (const proto of ['3', '5', '4', '6', '7']) {
      try {
        await this.sendCommand(`ATSP${proto}`, 3000);
        await delay(200);
        // KWP protocols often need an explicit init before Mode 01 queries.
        if (proto === '4' || proto === '5') {
          await this.sendCommand('ATFI', 3500).catch(() => {});
          await delay(250);
        }
        const cmd = this.mode01Format === 'compact' ? '0100' : '01 00';
        const probe = await this.sendCommand(cmd, 6000);
        if (/41\s*00|4100/i.test(probe)) return true;
      } catch { /* try next protocol */ }
    }

    // Revert to auto so users can still manually reconnect with best effort.
    await this.sendCommand('ATSP0', 3000).catch(() => {});
    return false;
  }

  // ─── Standard OBD-II reads ─────────────────────────────────────────────────

  async readStoredDTCs(): Promise<DTC[]> {
    const res = await this.sendCommand(READ_DTC_CMD, 4000);
    return parseDTCResponse(res, 'confirmed', 'Engine');
  }

  async readPendingDTCs(): Promise<DTC[]> {
    const res = await this.sendCommand(READ_PENDING_CMD, 4000);
    return parseDTCResponse(res, 'pending', 'Engine');
  }

  async readPermanentDTCs(): Promise<DTC[]> {
    // Mode 0A only supported on 2008+ CAN vehicles; 3s is ample for a NO DATA response
    const res = await this.sendCommand(READ_PERMANENT_CMD, 3000);
    return parseDTCResponse(res, 'permanent', 'Engine');
  }

  async readVIN(): Promise<string | null> {
    try {
      // Protocol is already negotiated by initELM327's warmup; go straight to VIN
      const res = await this.sendCommand('09 02', 3000).catch(() => '');
      return parseVINResponse(res);
    } catch {
      return null;
    }
  }

  // PID 0xA6 — cumulative odometer (supported on most 2010+ vehicles)
  async readOdometerKm(): Promise<number | null> {
    try {
      const res = await this.sendCommand('01 A6', 2000);
      for (const raw of res.split(/[\r\n]+/)) {
        const line = raw.trim();
        if (!line || line === '>' || line.startsWith('AT') || /NO DATA|ERROR|\?/i.test(line)) continue;
        const bytes = parseHexBytes(line);
        // Response: 41 A6 B0 B1 B2 B3 — distance in km × 0.1
        const idx = bytes.findIndex((b, i) => b === 0x41 && bytes[i + 1] === 0xA6);
        const start = idx >= 0 ? idx + 2 : (bytes[0] === 0xA6 ? 1 : -1);
        if (start < 0 || start + 3 >= bytes.length) continue;
        const raw32 = (bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3];
        return Math.round((raw32 >>> 0) / 10);
      }
    } catch { /* not supported */ }
    return null;
  }

  // ─── Quick standard scan (Mode 03/07/0A only — fast, no ECU polling) ────────

  async quickScan(onStatus?: (msg: string) => void): Promise<DTC[]> {
    const allDTCs: DTC[] = [];
    await this.sendCommand('ATH0', 1500).catch(() => {});

    onStatus?.('Reading confirmed fault codes...');
    allDTCs.push(...await this.readStoredDTCs().catch(() => []));

    onStatus?.('Reading pending fault codes...');
    allDTCs.push(...await this.readPendingDTCs().catch(() => []));

    onStatus?.('Reading permanent fault codes...');
    allDTCs.push(...await this.readPermanentDTCs().catch(() => []));

    return deduplicateDTCs(allDTCs);
  }

  // ─── Comprehensive multi-ECU scan ─────────────────────────────────────────

  async comprehensiveScan(make?: string, onStatus?: (msg: string) => void): Promise<DTC[]> {
    const allDTCs: DTC[] = [];

    // Step 1 — Standard OBD-II (works on every 1996+ car)
    onStatus?.('Standard OBD-II: reading confirmed codes...');
    await this.sendCommand('ATH0', 3000).catch(() => {}); // headers off for mode 03
    await this.sendCommand('ATCAF1', 3000).catch(() => {}); // CAN auto format
    const stored = await this.readStoredDTCs().catch(() => []);
    allDTCs.push(...stored);

    onStatus?.('Standard OBD-II: reading pending codes...');
    const pending = await this.readPendingDTCs().catch(() => []);
    allDTCs.push(...pending);

    onStatus?.('Standard OBD-II: reading permanent codes...');
    const permanent = await this.readPermanentDTCs().catch(() => []);
    allDTCs.push(...permanent);

    // Step 2 — Enable headers for UDS scanning
    onStatus?.('Enabling enhanced multi-ECU scan...');
    await this.sendCommand('ATH1', 3000).catch(() => {});  // headers on
    await this.sendCommand('ATAT2', 3000).catch(() => {}); // aggressive adaptive timing
    await delay(150);

    // Step 3 — UDS functional broadcast (hits all ECUs simultaneously)
    onStatus?.('Querying all ECUs via broadcast...');
    await this.sendCommand('ATSH 7DF', 3000).catch(() => {});
    const broadcastResp = await this.sendCommand('19 02 AF', 8000).catch(() => '');
    if (broadcastResp) {
      allDTCs.push(...parseUDSResponse(broadcastResp, '7DF'));
    }

    // Step 4 — Physical ECU scan (make-aware addresses)
    const ecuList = getECUScanList(make);
    for (let i = 0; i < ecuList.length; i++) {
      const addr = ecuList[i];
      const ecuName = ECU_NAMES[addr] ?? `ECU ${addr}`;
      onStatus?.(`Scanning ${ecuName} (${i + 1}/${ecuList.length})...`);

      await this.sendCommand(`ATSH ${addr}`, 1500).catch(() => {});
      // Reduced timeout: 3s vs 5s — unresponsive ECUs shouldn't stall the whole scan
      const udsResp = await this.sendCommand('19 02 AF', 3000).catch(() => '');

      if (udsResp && !isError(udsResp)) {
        const udsDTCs = parseUDSResponse(udsResp, addr);
        if (udsDTCs.length > 0) {
          allDTCs.push(...udsDTCs);
          continue;
        }
      }

      // Fallback to Mode 03 for ECUs that don't support UDS service 19
      const m03Resp = await this.sendCommand('03', 3000).catch(() => '');
      if (m03Resp && !isError(m03Resp)) {
        const m03DTCs = parseDTCResponse(m03Resp, 'confirmed', ecuName);
        allDTCs.push(...m03DTCs);
      }
    }

    // Step 5 — Restore clean state
    await this.sendCommand('ATH0', 2000).catch(() => {});
    await this.sendCommand('ATSH 7DF', 2000).catch(() => {});

    return deduplicateDTCs(allDTCs);
  }

  // ─── Live data ────────────────────────────────────────────────────────────

  async discoverSupportedPIDs(): Promise<Set<number>> {
    const supported = new Set<number>();

    for (const supportPID of SUPPORT_PIDS) {
      const hex = supportPID.toString(16).padStart(2, '0').toUpperCase();
      try {
        const res = await this.sendMode01WithFallback(hex, 5000, 0);
        // Response: 41 XX BB BB BB BB (where XX = PID queried, BB = 4 bitmask bytes)
        const lines = res.split(/[\r\n]+/).filter(l => l.trim() && !l.startsWith('AT') && l !== '>');
        for (const line of lines) {
          const bytes = parseHexBytes(line.trim());
          // Find 41 + supportPID in the response
          const idx = bytes.findIndex((b, i) => b === 0x41 && bytes[i + 1] === supportPID);
          const maskStart = idx >= 0 ? idx + 2 : (bytes[0] === supportPID ? 1 : -1);
          if (maskStart < 0 || maskStart + 3 >= bytes.length) continue;

          const mask = (bytes[maskStart] << 24) | (bytes[maskStart + 1] << 16) | (bytes[maskStart + 2] << 8) | bytes[maskStart + 3];
          for (let bit = 0; bit < 32; bit++) {
            if (mask & (1 << (31 - bit))) {
              const candidatePID = supportPID + bit + 1;
              if (PID_MAP.has(candidatePID)) supported.add(candidatePID);
            }
          }
        }
      } catch { /* not supported */ }
    }

    return supported;
  }

  async readPID(pid: number): Promise<number | null> {
    const def = PID_MAP.get(pid);
    if (!def) return null;

    const hex = pid.toString(16).padStart(2, '0').toUpperCase();
    try {
      // priority=1: live data reads jump ahead of pending scan/VIN commands (priority=0)
      const res = await this.sendMode01WithFallback(hex, 1800, 1);
      const decodedValues: number[] = [];
      for (const raw of res.split(/[\r\n]+/)) {
        const line = raw.trim();
        if (!line || line === '>' || line.startsWith('AT')) continue;
        if (/NO DATA|ERROR|STOPPED|\?/i.test(line)) continue;

        const bytes = parseHexBytes(line);
        // Response: [41, pid, ...data] or just [...data] after stripping header
        let dataStart = 0;
        const resp41idx = bytes.findIndex((b, i) => b === 0x41 && bytes[i + 1] === pid);
        if (resp41idx >= 0) dataStart = resp41idx + 2;
        else if (bytes[0] === 0x41 && bytes[1] === pid) dataStart = 2;
        else if (bytes.length >= def.bytes) dataStart = 0;

        const data = bytes.slice(dataStart, dataStart + def.bytes);
        if (data.length >= def.bytes) {
          decodedValues.push(def.decode(data));
        }
      }
      if (decodedValues.length === 0) return null;
      const nonZero = decodedValues.find(v => Number.isFinite(v) && Math.abs(v) > 0.0001);
      return nonZero ?? decodedValues[decodedValues.length - 1];
    } catch { /* timeout or error */ }
    return null;
  }

  // ─── Misc ─────────────────────────────────────────────────────────────────

  private async sendMode01WithFallback(hexPid: string, timeoutMs: number, priority: number): Promise<string> {
    const preferred = this.mode01Format === 'compact' ? `01${hexPid}` : `01 ${hexPid}`;
    const alternate = this.mode01Format === 'compact' ? `01 ${hexPid}` : `01${hexPid}`;
    try {
      const first = await this.sendCommand(preferred, timeoutMs, priority);
      if (first && !/NO DATA|ERROR|STOPPED|UNABLE|BUS|CAN ERROR|\?/i.test(first)) return first;
    } catch { /* try alternate */ }
    const second = await this.sendCommand(alternate, timeoutMs, priority);
    if (second && !/NO DATA|ERROR|STOPPED|UNABLE|BUS|CAN ERROR|\?/i.test(second)) {
      this.mode01Format = this.mode01Format === 'compact' ? 'spaced' : 'compact';
    }
    return second;
  }

  async clearDTCs(): Promise<boolean> {
    try {
      const res = await this.sendCommand('04', 5000);
      return res.includes('44') || res.toLowerCase().includes('ok');
    } catch { return false; }
  }

  disconnect() {
    // Set isConnected=false FIRST — any queued fn() calls will then hit the
    // "not connected" guard in sendCommandDirect and throw without doing I/O.
    // This prevents the AbortError caused by releaseLock() racing a pending write.
    this.isConnected = false;
    this.cmdRunning  = false;

    // Reject the currently in-flight response, if any
    const rejecter = this.responseRejecter;
    this.responseResolver = null;
    this.responseRejecter = null;
    if (rejecter) rejecter(new Error('Disconnected'));

    // Drain queued commands — isConnected=false guarantees no I/O is attempted
    const queued = this.cmdQueue.splice(0);
    for (const { fn } of queued) fn().catch(() => {});

    // Close hardware — safe now, no writes can be in flight
    if (this.bleDevice?.gatt?.connected) this.bleDevice.gatt.disconnect();
    try { this.serialReader?.cancel(); } catch { /* ignore */ }
    try { this.serialWriter?.releaseLock(); } catch { /* ignore */ }
    try { this.serialPort?.close(); } catch { /* ignore */ }

    this.method       = null;
    this.bleDevice    = null;
    this.bleWriteChar = null;
    this.serialPort   = null;
    this.serialWriter = null;
    this.serialReader = null;
  }

  setDebugListener(listener: ((msg: string) => void) | null) {
    this.debugListener = listener;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isError(response: string): boolean {
  return /NO DATA|ERROR|STOPPED|UNABLE|BUS|CAN ERROR|\?/.test(response.toUpperCase());
}
