import { CliError } from '../output.js';

export interface RateLimit { pointsSpent: number; pointsAllowed: number; pointsResetIn: number; ratio: number; }

export const RATE_LIMIT_FIELD = `rateLimitData { pointsSpentThisHour limitPerHour pointsResetIn }`;
export const QUOTA_THRESHOLD = 0.95;

export function parseRateLimitData(root: any): RateLimit | null {
  const d = root?.rateLimitData;
  if (!d || typeof d.limitPerHour !== 'number' || typeof d.pointsSpentThisHour !== 'number') return null;
  return {
    pointsSpent: d.pointsSpentThisHour,
    pointsAllowed: d.limitPerHour,
    pointsResetIn: d.pointsResetIn ?? 0,
    ratio: d.limitPerHour === 0 ? 0 : d.pointsSpentThisHour / d.limitPerHour,
  };
}

export function checkQuota(rl: RateLimit | null, force: boolean): void {
  if (force || !rl) return;
  if (rl.ratio > QUOTA_THRESHOLD) {
    throw new CliError(
      'QUOTA_LOW',
      `Rate limit at ${(rl.ratio * 100).toFixed(1)}% (${rl.pointsSpent}/${rl.pointsAllowed})`,
      `wait ${rl.pointsResetIn}s or pass --force`,
      { pointsSpent: rl.pointsSpent, limit: rl.pointsAllowed, resetInSeconds: rl.pointsResetIn },
    );
  }
}
