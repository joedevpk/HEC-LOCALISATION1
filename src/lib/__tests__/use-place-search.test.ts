import { describe, expect, it } from 'vitest';
import { autocompleteCooldownMs } from '../use-place-search';

describe('autocompleteCooldownMs', () => {
  it('met en pause l’autocomplétion après un refus ou un quota, pas après une simple panne', () => {
    expect(autocompleteCooldownMs('forbidden')).toBe(60_000);
    expect(autocompleteCooldownMs('rate_limited')).toBe(15_000);
    expect(autocompleteCooldownMs('network_error')).toBe(0);
    expect(autocompleteCooldownMs('timeout')).toBe(0);
    expect(autocompleteCooldownMs(undefined)).toBe(0);
  });
});
