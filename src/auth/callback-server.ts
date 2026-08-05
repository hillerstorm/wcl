import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CliError } from '../output.js';

export interface CallbackResult { code: string; state: string; }

export interface CallbackServer {
  url: string;
  awaitCallback(): Promise<CallbackResult>;
  close(): void;
}

const SUCCESS_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>wcl</title>
<style>body{font:14px system-ui;margin:4em auto;max-width:32em;text-align:center;color:#222}</style>
</head><body>
<h1>Authenticated</h1>
<p>You may close this tab and return to the terminal.</p>
</body></html>`;

export async function startCallbackServer(port = 31337): Promise<CallbackServer> {
  let resolveCb: (r: CallbackResult) => void;
  let rejectCb: (e: Error) => void;
  const promise = new Promise<CallbackResult>((res, rej) => { resolveCb = res; rejectCb = rej; });

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const errParam = url.searchParams.get('error');
      if (errParam) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end(`OAuth error: ${errParam}`);
        rejectCb(new Error(`OAuth error: ${errParam}`));
        return;
      }
      if (!code || !state) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('Missing code or state.');
        rejectCb(new Error('Missing code or state in callback query.'));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(SUCCESS_PAGE);
      resolveCb({ code, state });
    } else {
      res.writeHead(404).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', (e: NodeJS.ErrnoException) => {
      if (e.code === 'EADDRINUSE') {
        reject(new CliError(
          'NETWORK_ERROR',
          `Callback port ${port} is already in use.`,
          'close the process holding it (an abandoned "wcl auth"?) and retry',
        ));
      } else {
        reject(new CliError('NETWORK_ERROR', `Callback server failed to start: ${e.message}`));
      }
    });
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const addr = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${addr.port}`,
    awaitCallback: () => promise,
    close: () => server.close(),
  };
}
