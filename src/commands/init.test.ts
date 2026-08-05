import { describe, it, expect } from 'vitest';
import { buildConfig, type InitIO } from './init.js';

function scriptedIO(answers: string[]): { io: InitIO; logs: string[]; remaining: () => number } {
  const queue = [...answers];
  const logs: string[] = [];
  return {
    io: {
      prompt: async () => {
        if (queue.length === 0) throw new Error('ran out of scripted answers');
        return queue.shift()!;
      },
      log: (s) => logs.push(s),
      pathExists: () => true,
    },
    logs,
    remaining: () => queue.length,
  };
}

describe('buildConfig', () => {
  it('captures clientId + all four sim paths', async () => {
    const { io, remaining } = scriptedIO([
      'CID-ABC',
      '/sims/tbc-new',
      '/sims/mop',
      '/sims/classic',
      '/sims/sod',
    ]);
    const result = await buildConfig({}, io);
    expect(result.clientId).toBe('CID-ABC');
    expect(result.simPaths).toEqual({
      tbc: '/sims/tbc-new',
      mop: '/sims/mop',
      classic: '/sims/classic',
      sod: '/sims/sod',
    });
    expect(remaining()).toBe(0);
  });

  it('lets user skip expansions by pressing Enter', async () => {
    const { io } = scriptedIO([
      'CID-XYZ',
      '/sims/tbc-new',
      '', // skip mop
      '', // skip classic
      '', // skip sod
    ]);
    const result = await buildConfig({}, io);
    expect(result.simPaths).toEqual({ tbc: '/sims/tbc-new' });
  });

  it('keeps current clientId on empty input, requires it when absent', async () => {
    const { io } = scriptedIO(['', '', '', '', '']);
    const result = await buildConfig({ clientId: 'EXISTING' }, io);
    expect(result.clientId).toBe('EXISTING');
    expect(result.simPaths).toBeUndefined();
  });

  it('re-prompts when client ID missing and Enter pressed', async () => {
    const { io } = scriptedIO(['', 'finally-set', '', '', '', '']);
    const result = await buildConfig({}, io);
    expect(result.clientId).toBe('finally-set');
  });

  it('clears a sim path when user types "-"', async () => {
    const { io } = scriptedIO(['CID-1', '-', '', '', '']);
    const result = await buildConfig(
      { clientId: 'old', simPaths: { tbc: '/old/tbc', mop: '/keep/mop' } },
      io,
    );
    expect(result.simPaths).toEqual({ mop: '/keep/mop' });
  });

  it('refuses to clear clientId via "-"', async () => {
    const { io, logs } = scriptedIO(['-', 'NEW-CID', '', '', '', '']);
    const result = await buildConfig({ clientId: 'OLD' }, io);
    expect(result.clientId).toBe('NEW-CID');
    expect(logs.some(l => l.includes('cannot be cleared'))).toBe(true);
  });

  it('omits simPaths key when all expansions are skipped', async () => {
    const { io } = scriptedIO(['CID', '', '', '', '']);
    const result = await buildConfig({}, io);
    expect(result).toEqual({ clientId: 'CID' });
  });
});
