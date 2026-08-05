import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeCredentials } from '../auth/store.js';
import { runQuery } from './query.js';

beforeEach(() => {
  process.env.WCL_CONFIG_DIR = mkdtempSync(join(tmpdir(), 'wcl-query-cfg-'));
  process.env.WCL_CACHE_DIR = mkdtempSync(join(tmpdir(), 'wcl-query-cache-'));
  writeCredentials({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3_600_000, token_type: 'Bearer' });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('query command', () => {
  it('reads query from file and prints response data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wcl-query-'));
    const path = join(dir, 'q.graphql');
    writeFileSync(path, 'query { __typename }');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { __typename: 'Query' } }), { status: 200 }),
    );

    const lines: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { lines.push(c.toString()); return true; });

    await runQuery({ instance: 'fresh', force: true, pretty: false, useCache: false, file: path, stdin: false, vars: [] });
    expect(JSON.parse(lines.join('')).data).toEqual({ __typename: 'Query' });
  });

  it('parses --var key=value pairs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const dir = mkdtempSync(join(tmpdir(), 'wcl-query-'));
    const path = join(dir, 'q.graphql');
    writeFileSync(path, 'query Q($id: Int!, $name: String) { x }');

    await runQuery({ instance: 'fresh', force: true, pretty: false, useCache: false, file: path, stdin: false, vars: ['id=42', 'name=Hello'] });

    const body = JSON.parse((vi.mocked(globalThis.fetch).mock.calls[0]![1]!.body as string));
    expect(body.variables).toEqual({ id: 42, name: 'Hello' });
  });

  it('parses --var key:=json as raw JSON, allowing digit-only strings', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const dir = mkdtempSync(join(tmpdir(), 'wcl-query-'));
    const path = join(dir, 'q.graphql');
    writeFileSync(path, 'query Q($code: String!, $ids: [Int!]) { x }');

    await runQuery({
      instance: 'fresh', force: true, pretty: false, useCache: false, file: path, stdin: false,
      vars: ['code:="123456789"', 'ids:=[1,2,3]'],
    });

    const body = JSON.parse((vi.mocked(globalThis.fetch).mock.calls[0]![1]!.body as string));
    expect(body.variables).toEqual({ code: '123456789', ids: [1, 2, 3] });
  });

  it('rejects malformed :=json with BAD_INPUT', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const dir = mkdtempSync(join(tmpdir(), 'wcl-query-'));
    const path = join(dir, 'q.graphql');
    writeFileSync(path, 'query { x }');

    await expect(runQuery({
      instance: 'fresh', force: true, pretty: false, useCache: false, stdin: false,
      file: path,
      vars: ['x:=not-json'],
    })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
});
