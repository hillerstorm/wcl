import { describe, it, expect } from 'vitest';
import { parseRateLimitData, checkQuota, RATE_LIMIT_FIELD } from './rate-limit.js';
import { CliError } from '../output.js';

describe('rate-limit', () => {
  it('parses rateLimitData from a GraphQL response root', () => {
    const r = parseRateLimitData({ rateLimitData: { pointsSpentThisHour: 10, limitPerHour: 1000, pointsResetIn: 1200 } });
    expect(r).toEqual({ pointsSpent: 10, pointsAllowed: 1000, pointsResetIn: 1200, ratio: 0.01 });
  });

  it('returns null when missing', () => {
    expect(parseRateLimitData({})).toBeNull();
    expect(parseRateLimitData(null)).toBeNull();
  });

  it('checkQuota throws QUOTA_LOW when ratio > 0.95 and not --force', () => {
    expect(() => checkQuota({ pointsSpent: 960, pointsAllowed: 1000, pointsResetIn: 600, ratio: 0.96 }, false))
      .toThrow(CliError);
  });

  it('checkQuota passes at exactly 0.95', () => {
    expect(() => checkQuota({ pointsSpent: 950, pointsAllowed: 1000, pointsResetIn: 600, ratio: 0.95 }, false))
      .not.toThrow();
  });

  it('--force bypasses', () => {
    expect(() => checkQuota({ pointsSpent: 999, pointsAllowed: 1000, pointsResetIn: 600, ratio: 0.999 }, true))
      .not.toThrow();
  });

  it('RATE_LIMIT_FIELD is the inline GraphQL fragment', () => {
    expect(RATE_LIMIT_FIELD).toContain('rateLimitData');
    expect(RATE_LIMIT_FIELD).toContain('pointsSpentThisHour');
  });
});
