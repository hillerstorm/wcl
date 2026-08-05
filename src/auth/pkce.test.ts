import { describe, it, expect } from 'vitest';
import { generateVerifier, deriveChallenge, generateState } from './pkce.js';

describe('pkce', () => {
  it('generateVerifier produces a 96-char string in the unreserved set', () => {
    const v = generateVerifier();
    expect(v).toHaveLength(96);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]{96}$/);
  });

  it('deriveChallenge matches the RFC 7636 example vector', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(deriveChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('generateState returns 64 hex chars (32 random bytes)', () => {
    const s = generateState();
    expect(s).toHaveLength(64);
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    expect(generateState()).not.toBe(s);
  });
});
