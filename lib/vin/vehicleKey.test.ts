import { describe, it, expect } from 'vitest';
import type { NhtsaDecodeResult } from './nhtsa';
import {
  vehicleKeyFromDecode,
  deriveVehicleKeyParts,
  parseVehicleKey,
  vehicleKeyMatchScore,
  vehicleKeyFromFields,
  buildVehicleKey,
} from './vehicleKey';

describe('deriveVehicleKeyParts', () => {
  it('handles a complete NHTSA decode (BMW Z4 3.0)', () => {
    const decoded: NhtsaDecodeResult = {
      make: 'BMW',
      model: 'Z4',
      trim: '3.0i',
      modelYear: 2004,
      driveType: 'Rear-Wheel Drive',
      engineCylinders: 6,
      engineDisplacementL: 3.0,
      fuelTypePrimary: 'Gasoline',
      transmissionStyle: 'Manual',
    };
    const parts = deriveVehicleKeyParts(decoded);
    expect(parts.make).toBe('bmw');
    expect(parts.model).toBe('z4');
    expect(parts.trim).toBe('3.0i');
    expect(parts.year).toBe(2004);
    expect(parts.engine).toBe('3.0l-i6-mt');
    expect(parts.drivetrain).toBe('rwd');
  });

  it('handles a Toyota Tacoma with 4WD', () => {
    const decoded: NhtsaDecodeResult = {
      make: 'TOYOTA',
      model: 'Tacoma',
      trim: 'TRD Off-Road',
      modelYear: 2020,
      driveType: '4x4',
      engineCylinders: 6,
      engineDisplacementL: 3.5,
      fuelTypePrimary: 'Gasoline',
      transmissionStyle: 'Automatic',
    };
    const parts = deriveVehicleKeyParts(decoded);
    expect(parts.make).toBe('toyota');
    expect(parts.model).toBe('tacoma');
    expect(parts.trim).toBe('trd off road');
    expect(parts.year).toBe(2020);
    expect(parts.engine).toBe('3.5l-i6-at');
    expect(parts.drivetrain).toBe('4wd');
  });

  it('handles a Tesla (electric, no cylinders)', () => {
    const decoded: NhtsaDecodeResult = {
      make: 'TESLA',
      model: 'Model 3',
      trim: 'Long Range',
      modelYear: 2022,
      driveType: 'All-Wheel Drive',
      fuelTypePrimary: 'Electric',
    };
    const parts = deriveVehicleKeyParts(decoded);
    expect(parts.make).toBe('tesla');
    expect(parts.model).toBe('model 3');
    expect(parts.trim).toBe('long range');
    expect(parts.engine).toBe('ev');
    expect(parts.drivetrain).toBe('awd');
  });

  it('handles a diesel truck', () => {
    const decoded: NhtsaDecodeResult = {
      make: 'Ford',
      model: 'F-250',
      modelYear: 2019,
      driveType: 'Four-Wheel Drive',
      engineCylinders: 8,
      engineDisplacementL: 6.7,
      fuelTypePrimary: 'Diesel',
      transmissionStyle: 'Automatic',
    };
    const parts = deriveVehicleKeyParts(decoded);
    expect(parts.engine).toBe('6.7l-v8-diesel-at');
    expect(parts.drivetrain).toBe('4wd');
  });

  it('handles a CVT transmission', () => {
    const decoded: NhtsaDecodeResult = {
      make: 'Subaru',
      model: 'Impreza',
      modelYear: 2021,
      transmissionStyle: 'Continuously Variable',
    };
    const parts = deriveVehicleKeyParts(decoded);
    expect(parts.engine).toContain('cvt');
  });

  it('handles missing fields gracefully', () => {
    const decoded: NhtsaDecodeResult = {};
    const parts = deriveVehicleKeyParts(decoded);
    expect(parts.make).toBe('');
    expect(parts.model).toBe('');
    expect(parts.trim).toBe('');
    expect(parts.year).toBeNull();
    expect(parts.engine).toBe('');
    expect(parts.drivetrain).toBe('');
  });

  it('handles an error-only decode', () => {
    const decoded: NhtsaDecodeResult = { errorText: 'Invalid VIN format' };
    const parts = deriveVehicleKeyParts(decoded);
    expect(parts.make).toBe('');
    expect(parts.year).toBeNull();
  });
});

describe('vehicleKeyFromDecode', () => {
  it('produces a pipe-delimited string', () => {
    const decoded: NhtsaDecodeResult = {
      make: 'Mazda',
      model: 'MX-5 Miata',
      trim: 'Club',
      modelYear: 2019,
      driveType: 'Rear-Wheel Drive',
      engineCylinders: 4,
      engineDisplacementL: 2.0,
      transmissionStyle: 'Manual',
    };
    const key = vehicleKeyFromDecode(decoded);
    expect(key).toBe('mazda|mx 5 miata|club|2019|2.0l-i4-mt|rwd');
  });

  it('leaves empty segments for missing data', () => {
    const decoded: NhtsaDecodeResult = {
      make: 'Honda',
      model: 'Civic',
      modelYear: 2015,
    };
    const key = vehicleKeyFromDecode(decoded);
    expect(key).toBe('honda|civic||2015||');
  });
});

describe('parseVehicleKey', () => {
  it('round-trips through build + parse', () => {
    const original = {
      make: 'bmw',
      model: 'z4',
      trim: '3.0i',
      year: 2004,
      engine: '3.0l-i6-mt',
      drivetrain: 'rwd',
    };
    const key = buildVehicleKey(original);
    const parsed = parseVehicleKey(key);
    expect(parsed).toEqual(original);
  });

  it('handles empty key', () => {
    const parsed = parseVehicleKey('||||');
    expect(parsed.make).toBe('');
    expect(parsed.year).toBeNull();
  });
});

describe('vehicleKeyMatchScore', () => {
  const z4_30 = 'bmw|z4|3.0i|2004|3.0l-i6-mt|rwd';
  const z4_25 = 'bmw|z4|2.5i|2004|2.5l-i6-mt|rwd';
  const z4_30_2005 = 'bmw|z4|3.0i|2005|3.0l-i6-mt|rwd';
  const miata = 'mazda|mx 5 miata|club|2019|2.0l-i4-mt|rwd';
  const civic = 'honda|civic||2015||';

  it('identical keys score 1.0', () => {
    expect(vehicleKeyMatchScore(z4_30, z4_30)).toBeCloseTo(1.0, 2);
  });

  it('same model different engine scores lower than same engine', () => {
    const sameEngine = vehicleKeyMatchScore(z4_30, z4_30_2005);
    const diffEngine = vehicleKeyMatchScore(z4_30, z4_25);
    expect(sameEngine).toBeGreaterThan(diffEngine);
  });

  it('completely different vehicles score very low', () => {
    expect(vehicleKeyMatchScore(z4_30, miata)).toBeLessThan(0.3);
    expect(vehicleKeyMatchScore(z4_30, civic)).toBeLessThan(0.3);
  });

  it('missing engine data on comp does not crash', () => {
    const score = vehicleKeyMatchScore(z4_30, 'bmw|z4|3.0i|2004||');
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });
});

describe('vehicleKeyFromFields', () => {
  it('builds a key without engine/drivetrain', () => {
    const key = vehicleKeyFromFields({ make: 'BMW', model: 'Z4', trim: '3.0i', year: 2004 });
    expect(key).toBe('bmw|z4|3.0i|2004||');
  });

  it('handles missing optional fields', () => {
    const key = vehicleKeyFromFields({ make: 'Honda', model: 'Civic' });
    expect(key).toBe('honda|civic||||');
  });
});
