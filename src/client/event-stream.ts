import { gqlRequest, type Instance } from './graphql.js';
import { EVENTS_QUERY, type EventsPageData } from '../queries/events.graphql.js';
import { CliError } from '../output.js';
import type { RateLimit } from './rate-limit.js';

export interface EventStreamArgs {
  instance: Instance;
  code: string;
  fightId: number;
  dataType: string;
  start: number;
  end: number;
  sourceID?: number;
  targetID?: number;
  abilityID?: number;
  hostility?: 'Friendlies' | 'Enemies';
  limit?: number;
  maxPages?: number;
  useCache: boolean;
  cacheTtlSeconds: number;
  force: boolean;
}

export interface EventStream {
  events: any[];
  pages: number;
  truncated: boolean;
  nextPageTimestamp: number | null;
  rateLimit: RateLimit | null;
}

// Fetches a complete event stream by following nextPageTimestamp until exhausted
// (or maxPages is hit, in which case `truncated` is set). Always pass sourceID /
// targetID when the consumer only cares about one actor — unfiltered streams cost
// a whole raid's worth of API points per page.
export async function fetchEventStream(args: EventStreamArgs): Promise<EventStream> {
  const limit = args.limit ?? 10000;
  const maxPages = args.maxPages ?? 20;
  const events: any[] = [];
  let cursor = args.start;
  let pages = 0;
  let nextPageTimestamp: number | null = null;
  let rateLimit: RateLimit | null = null;

  while (pages < maxPages) {
    const r = await gqlRequest<EventsPageData>({
      instance: args.instance, query: EVENTS_QUERY,
      variables: {
        code: args.code, fightId: args.fightId, dataType: args.dataType,
        start: cursor, end: args.end, limit,
        ...(args.sourceID !== undefined ? { sourceID: args.sourceID } : {}),
        ...(args.targetID !== undefined ? { targetID: args.targetID } : {}),
        ...(args.abilityID !== undefined ? { abilityID: args.abilityID } : {}),
        ...(args.hostility !== undefined ? { hostility: args.hostility } : {}),
      },
      useCache: args.useCache, cacheTtlSeconds: args.cacheTtlSeconds, force: args.force,
    });
    rateLimit = r.rateLimit ?? rateLimit;
    const page = r.data?.reportData?.report?.events;
    if (!page) throw new CliError('NOT_FOUND', `no events returned for fight ${args.fightId}`);
    events.push(...(page.data ?? []));
    pages += 1;
    nextPageTimestamp = page.nextPageTimestamp ?? null;
    if (nextPageTimestamp === null) break;
    cursor = nextPageTimestamp;
  }

  return { events, pages, truncated: nextPageTimestamp !== null, nextPageTimestamp, rateLimit };
}
