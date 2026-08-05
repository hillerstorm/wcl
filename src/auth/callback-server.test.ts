import { describe, it, expect } from 'vitest';
import { startCallbackServer } from './callback-server.js';

describe('callback server', () => {
  it('resolves with code + state when /callback is hit', async () => {
    const { url, awaitCallback, close } = await startCallbackServer(0);
    try {
      const p = awaitCallback();
      await fetch(`${url}/callback?code=abc&state=xyz`);
      expect(await p).toEqual({ code: 'abc', state: 'xyz' });
    } finally {
      close();
    }
  });

  it('rejects when query param is missing', async () => {
    const { url, awaitCallback, close } = await startCallbackServer(0);
    try {
      const p = awaitCallback();
      const expectation = expect(p).rejects.toThrow(/missing/i);
      await fetch(`${url}/callback`);
      await expectation;
    } finally {
      close();
    }
  });

  it('serves a success page on /callback with code + state', async () => {
    const { url, awaitCallback, close } = await startCallbackServer(0);
    try {
      const responsePromise = fetch(`${url}/callback?code=c&state=s`);
      await awaitCallback();
      const res = await responsePromise;
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toMatch(/close this tab|authenticated/i);
    } finally {
      close();
    }
  });
});
