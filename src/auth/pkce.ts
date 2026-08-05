import { createHash, randomBytes } from 'node:crypto';

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function generateVerifier(): string {
  const buf = randomBytes(96);
  let out = '';
  for (let i = 0; i < 96; i++) {
    out += UNRESERVED[buf[i]! % UNRESERVED.length];
  }
  return out;
}

export function deriveChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function generateState(): string {
  return randomBytes(32).toString('hex');
}
