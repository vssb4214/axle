import type { DTC, DTCStatus, DTCSystem } from './types';
import { dtcDatabase } from './dtcDatabase';

export const READ_DTC_CMD = '03';
export const READ_PENDING_CMD = '07';
export const READ_PERMANENT_CMD = '0A';
export const READ_VIN_CMD = '0902';

// ─── ECU address tables ───────────────────────────────────────────────────────

export const ECU_NAMES: Record<string, string> = {
  // Standard OBD-II physical addresses
  '7E0': 'Engine',
  '7E1': 'Transmission',
  '7E2': 'ABS / Brake',
  '7E3': 'Body Control',
  '7E4': 'BCM',
  '7E5': 'Instrument Cluster',
  '7E6': 'HVAC',
  '7E7': 'Gateway',
  // Standard response addresses (request + 8)
  '7E8': 'Engine',
  '7E9': 'Transmission',
  '7EA': 'ABS / Brake',
  '7EB': 'Body Control',
  '7EC': 'BCM',
  '7ED': 'Instrument Cluster',
  '7EE': 'HVAC',
  '7EF': 'Gateway',
  // BMW
  '612': 'BMW Engine (DME)',
  '61A': 'BMW Engine (DME)',
  '613': 'BMW Stability (DSC)',
  '61B': 'BMW Stability (DSC)',
  '614': 'BMW Airbag (MRS)',
  '615': 'BMW Instruments (KOMBI)',
  '616': 'BMW Transmission (EGS)',
  '617': 'BMW Parking (PDC)',
  '618': 'BMW Gearbox (SMG/EGS)',
  '636': 'BMW Steering (EPS)',
  // VAG (VW / Audi / Seat / Skoda)
  '713': 'VAG ABS / ESP',
  '77D': 'VAG Gateway',
  '7C0': 'VAG Instrument Cluster',
  // Ford
  '726': 'Ford Airbag',
  // Toyota / Lexus
  '750': 'Toyota ABS',
  // Mercedes
  '7A0': 'Mercedes ECM',
  '7A8': 'Mercedes ECM',
};

// ECU addresses to poll per manufacturer, in priority order.
// Each entry: [request_address, friendly_name_override?]
export const MAKE_ECU_SCAN_LIST: Record<string, string[]> = {
  DEFAULT: ['7E0', '7E1', '7E2', '7E3', '7E4'],
  BMW:     ['612', '616', '613', '614', '615', '617', '618', '636', '7E0', '7E1'],
  MINI:    ['612', '616', '613', '614', '615', '7E0', '7E1'],
  VAG:     ['7E0', '7E1', '713', '77D', '7C0'],
  VW:      ['7E0', '7E1', '713', '77D', '7C0'],
  AUDI:    ['7E0', '7E1', '713', '77D', '7C0'],
  SEAT:    ['7E0', '7E1', '713', '77D', '7C0'],
  SKODA:   ['7E0', '7E1', '713', '77D', '7C0'],
  PORSCHE: ['7E0', '7E1', '713', '77D'],
  FORD:    ['7E0', '7E1', '760', '726', '7E4'],
  LINCOLN: ['7E0', '7E1', '760', '726', '7E4'],
  GM:      ['7E0', '7E1', '7E3', '7E4', '7E5'],
  CHEVROLET: ['7E0', '7E1', '7E3', '7E4'],
  BUICK:   ['7E0', '7E1', '7E3', '7E4'],
  CADILLAC: ['7E0', '7E1', '7E3', '7E4'],
  GMC:     ['7E0', '7E1', '7E3', '7E4'],
  TOYOTA:  ['7E0', '7E1', '750', '760'],
  LEXUS:   ['7E0', '7E1', '750', '760'],
  SCION:   ['7E0', '7E1', '750'],
  HONDA:   ['7E0', '7E1', '7E3'],
  ACURA:   ['7E0', '7E1', '7E3'],
  NISSAN:  ['7E0', '7E1', '7E2', '7E3'],
  INFINITI: ['7E0', '7E1', '7E2', '7E3'],
  MAZDA:   ['7E0', '7E1', '7E2'],
  SUBARU:  ['7E0', '7E1', '7E2', '7E3'],
  HYUNDAI: ['7E0', '7E1', '7E2', '7E3', '7E4'],
  KIA:     ['7E0', '7E1', '7E2', '7E3', '7E4'],
  GENESIS: ['7E0', '7E1', '7E2', '7E3', '7E4'],
  MERCEDES: ['7A0', '7E0', '7E1', '7E2'],
  'MERCEDES-BENZ': ['7A0', '7E0', '7E1', '7E2'],
  CHRYSLER: ['7E0', '7E1', '7E3', '7E4'],
  DODGE:   ['7E0', '7E1', '7E3', '7E4'],
  JEEP:    ['7E0', '7E1', '7E3', '7E4'],
  RAM:     ['7E0', '7E1', '7E3', '7E4'],
  STELLANTIS: ['7E0', '7E1', '7E3', '7E4'],
  VOLVO:   ['7E0', '7E1', '7E2', '7E3'],
  JAGUAR:  ['7E0', '7E1', '7E2'],
  LANDROVER: ['7E0', '7E1', '7E2'],
  'LAND ROVER': ['7E0', '7E1', '7E2'],
  FIAT:    ['7E0', '7E1', '713'],
  ALFA:    ['7E0', '7E1', '713'],
  'ALFA ROMEO': ['7E0', '7E1', '713'],
  FERRARI: ['7E0', '7E1'],
  LAMBORGHINI: ['7E0', '7E1'],
  MASERATI: ['7E0', '7E1', '713'],
  TESLA:   ['7E0', '7E1', '7E4'],
  RIVIAN:  ['7E0', '7E1'],
  LUCID:   ['7E0', '7E1'],
  MITSUBISHI: ['7E0', '7E1', '7E2'],
  SUZUKI:  ['7E0', '7E1'],
  ISUZU:   ['7E0', '7E1'],
  SAAB:    ['7E0', '7E1', '713'],
  PEUGEOT: ['7E0', '7E1', '713'],
  CITROEN: ['7E0', '7E1', '713'],
  RENAULT: ['7E0', '7E1', '713'],
};

export function getECUScanList(make?: string): string[] {
  if (!make) return MAKE_ECU_SCAN_LIST.DEFAULT;
  const key = make.toUpperCase().trim();
  return MAKE_ECU_SCAN_LIST[key] ?? MAKE_ECU_SCAN_LIST.DEFAULT;
}

// ─── Hex parsing helpers ──────────────────────────────────────────────────────

export function parseHexBytes(str: string): number[] {
  const trimmed = str.trim();
  if (!trimmed) return [];

  // Normal ELM327 formatting is space-delimited bytes, but some adapters
  // return compact hex strings (eg "410C1AF8"). Support both styles.
  const spaced = trimmed
    .split(/\s+/)
    .filter(b => /^[0-9A-Fa-f]{2}$/.test(b))
    .map(b => parseInt(b, 16));
  if (spaced.length > 0) return spaced;

  const compactRuns = trimmed.match(/[0-9A-Fa-f]{2,}/g) ?? [];
  const out: number[] = [];
  for (const run of compactRuns) {
    for (let i = 0; i + 1 < run.length; i += 2) {
      out.push(parseInt(run.slice(i, i + 2), 16));
    }
  }
  return out;
}

function isErrorResponse(line: string): boolean {
  return /NO DATA|ERROR|STOPPED|UNABLE|BUS BUSY|BUS ERROR|CAN ERROR|\?/.test(line.toUpperCase());
}

// ─── Mode 03 / 07 / 0A DTC parsing ───────────────────────────────────────────

function decodeModeBytes(b1: number, b2: number, status: DTCStatus, ecuName?: string): DTC | null {
  if (b1 === 0 && b2 === 0) return null;

  const systemMap: DTCSystem[] = ['P', 'C', 'B', 'U'];
  const system = systemMap[(b1 >> 6) & 0x03];
  const d1 = (b1 >> 4) & 0x03;
  const d2 = b1 & 0x0f;
  const d3 = (b2 >> 4) & 0x0f;
  const d4 = b2 & 0x0f;

  const code = `${system}${d1}${d2.toString(16).toUpperCase()}${d3.toString(16).toUpperCase()}${d4.toString(16).toUpperCase()}`;
  return { code, system, status, description: dtcDatabase[code], ecuName };
}

export function parseDTCResponse(response: string, status: DTCStatus, ecuName?: string): DTC[] {
  // Mode 03 → response prefix 0x43, Mode 07 → 0x47, Mode 0A → 0x4A
  const prefixMap: Record<DTCStatus, string> = { confirmed: '43', pending: '47', permanent: '4A' };
  const expectedPrefix = prefixMap[status];
  const dtcs: DTC[] = [];

  for (const raw of response.split(/[\r\n]+/)) {
    const line = raw.trim();
    if (!line || line === '>' || line.startsWith('AT') || isErrorResponse(line)) continue;

    const cleaned = line.startsWith(expectedPrefix) ? line.slice(2).trim() : line;
    const bytes = parseHexBytes(cleaned);

    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const dtc = decodeModeBytes(bytes[i], bytes[i + 1], status, ecuName);
      if (dtc) dtcs.push(dtc);
    }
  }

  return dtcs;
}

// ─── UDS Service 19 (ReadDTCInformation) parsing ─────────────────────────────

function decodeUDSStatusToDTCStatus(statusByte: number): DTCStatus {
  // bit 3 = confirmedDTC, bit 0 = testFailed, bit 5 = testFailedSinceLastClear
  // bit 2 = pendingDTC
  if (statusByte & 0x02) return 'permanent';
  if (statusByte & 0x04) return 'pending';
  return 'confirmed';
}

function decodeUDSBytes(b1: number, b2: number, b3: number, statusByte: number, ecuName: string): DTC | null {
  if (b1 === 0 && b2 === 0 && b3 === 0) return null;
  // Skip "no fault" entries (status = 0x00 means no active fault in some implementations)
  if (statusByte === 0x00) return null;

  const dtcStatus = decodeUDSStatusToDTCStatus(statusByte);

  // b3 === 0x00 or 0xFF indicates a standard 2-byte OBD-II code in b1+b2
  if (b3 === 0x00 || b3 === 0xFF) {
    const dtc = decodeModeBytes(b1, b2, dtcStatus, ecuName);
    return dtc;
  }

  // 3-byte manufacturer-specific code — display as hex
  const hex = [b1, b2, b3].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  // Determine system from high nibble of b1
  const systemMap: DTCSystem[] = ['P', 'C', 'B', 'U'];
  const system = systemMap[(b1 >> 6) & 0x03] ?? 'P';
  return {
    code: hex,
    system,
    status: dtcStatus,
    description: `Manufacturer-specific fault (${ecuName})`,
    ecuName,
  };
}

export function parseUDSResponse(response: string, requestAddr: string): DTC[] {
  const dtcs: DTC[] = [];

  for (const raw of response.split(/[\r\n]+/)) {
    const line = raw.trim();
    if (!line || line === '>' || line.startsWith('AT') || isErrorResponse(line)) continue;

    // Strip CAN header if present ("7E8 ...") and capture which ECU responded
    let dataStr = line;
    let respAddr = requestAddr;
    const headerMatch = line.match(/^([0-9A-Fa-f]{3,8})\s+/);
    if (headerMatch) {
      respAddr = headerMatch[1].toUpperCase();
      dataStr = line.slice(headerMatch[0].length).trim();
    }

    const ecuName = ECU_NAMES[respAddr] ?? ECU_NAMES[requestAddr.toUpperCase()] ?? `ECU ${respAddr}`;
    const bytes = parseHexBytes(dataStr);

    // Service 19 response: 0x59, subfunction 0x02, status mask, then 4 bytes per DTC
    if (bytes.length < 3 || bytes[0] !== 0x59 || bytes[1] !== 0x02) continue;

    // bytes[2] = DTCStatusAvailabilityMask; DTCs start at index 3
    for (let i = 3; i + 3 < bytes.length; i += 4) {
      const dtc = decodeUDSBytes(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3], ecuName);
      if (dtc) dtcs.push(dtc);
    }
  }

  return dtcs;
}

// ─── VIN parser ───────────────────────────────────────────────────────────────

export function parseVINResponse(response: string): string | null {
  let hex = '';
  for (const raw of response.split(/[\r\n]+/)) {
    const line = raw.trim();
    if (!line || line === '>' || line.startsWith('AT')) continue;
    const stripped = line.replace(/^[0-9A-Fa-f]{2}:\s*/, '').replace(/^[0-9A-Fa-f]{3}\s+/, '');
    hex += stripped.replace(/\s+/g, '');
  }

  const markerIdx = hex.indexOf('4902');
  if (markerIdx === -1) return null;
  const vinHex = hex.slice(markerIdx + 6);

  try {
    const chars: string[] = [];
    for (let i = 0; i + 1 < vinHex.length && chars.length < 17; i += 2) {
      const code = parseInt(vinHex.slice(i, i + 2), 16);
      if (code >= 0x20 && code < 0x7f) chars.push(String.fromCharCode(code));
    }
    const vin = chars.join('').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    return vin.length === 17 ? vin : null;
  } catch {
    return null;
  }
}

// ─── Manual entry parser ──────────────────────────────────────────────────────

export function parseDTCManual(input: string): DTC[] {
  return input
    .split(/[\s,;]+/)
    .map(s => s.trim().toUpperCase())
    .filter(s => /^[PCBU][0-9]{4}$/.test(s))
    .map(code => ({
      code,
      system: code[0] as DTCSystem,
      status: 'confirmed' as DTCStatus,
      description: dtcDatabase[code],
    }));
}

// ─── Deduplication ───────────────────────────────────────────────────────────

export function deduplicateDTCs(dtcs: DTC[]): DTC[] {
  const seen = new Map<string, DTC>();
  for (const dtc of dtcs) {
    const existing = seen.get(dtc.code);
    if (!existing) {
      seen.set(dtc.code, dtc);
    } else {
      // Prefer confirmed over pending, and entries with ECU names
      if (dtc.status === 'confirmed' && existing.status !== 'confirmed') {
        seen.set(dtc.code, dtc);
      } else if (dtc.ecuName && !existing.ecuName) {
        seen.set(dtc.code, { ...existing, ecuName: dtc.ecuName });
      }
    }
  }
  return Array.from(seen.values());
}
