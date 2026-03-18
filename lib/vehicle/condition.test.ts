import { normalizeSeverity } from './condition';

describe('normalizeSeverity', () => {
  it('maps common synonyms', () => {
    expect(normalizeSeverity('minor')).toBe('light');
    expect(normalizeSeverity('medium')).toBe('moderate');
    expect(normalizeSeverity('major')).toBe('severe');
  });

  it('defaults unknown to none', () => {
    expect(normalizeSeverity('???')).toBe('none');
    expect(normalizeSeverity(undefined)).toBe('none');
  });
});
