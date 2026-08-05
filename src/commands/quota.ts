import { gqlRequest, type Instance } from '../client/graphql.js';
import { writeStdout, CliError } from '../output.js';

export interface QuotaOptions { instance: Instance; force: boolean; pretty: boolean; }

export async function runQuota(opts: QuotaOptions): Promise<void> {
  const r = await gqlRequest({
    instance: opts.instance,
    query: `query { __typename }`,
    variables: {},
    useCache: false,
    force: opts.force,
  });
  if (!r.rateLimit) {
    throw new CliError('GRAPHQL_ERROR', 'rateLimitData missing from response');
  }
  writeStdout(r.rateLimit, opts.pretty);
}
