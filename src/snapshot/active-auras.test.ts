import { describe, it, expect } from 'vitest';
import { activeAurasAt } from './active-auras.js';

const TARGET = 7;

function ev(type: string, ts: number, abilityGameID: number, sourceID?: number, targetID = TARGET, stack = 1) {
  return { type, timestamp: ts, abilityGameID, sourceID, targetID, stack };
}

describe('activeAurasAt', () => {
  it('returns empty when no events precede T', () => {
    expect(activeAurasAt([], TARGET, 100)).toEqual([]);
  });

  it('applybuff at t<T includes the aura at T', () => {
    const events = [ev('applybuff', 50, 1234, 99)];
    const r = activeAurasAt(events, TARGET, 100);
    expect(r).toHaveLength(1);
    expect(r[0]!.abilityGameID).toBe(1234);
    expect(r[0]!.sourceID).toBe(99);
    expect(r[0]!.appliedAt).toBe(50);
    expect(r[0]!.stacks).toBe(1);
  });

  it('removebuff before T removes the aura', () => {
    const events = [ev('applybuff', 50, 1234, 99), ev('removebuff', 80, 1234, 99)];
    expect(activeAurasAt(events, TARGET, 100)).toHaveLength(0);
  });

  it('stack events accumulate', () => {
    const events = [
      ev('applybuff', 50, 1234, 99),
      ev('applybuffstack', 60, 1234, 99, TARGET, 2),
      ev('applybuffstack', 70, 1234, 99, TARGET, 3),
    ];
    const r = activeAurasAt(events, TARGET, 100);
    expect(r[0]!.stacks).toBe(3);
  });

  it('removestack decrements but does not remove until removebuff', () => {
    const events = [
      ev('applybuff', 50, 1234, 99),
      ev('applybuffstack', 60, 1234, 99, TARGET, 3),
      ev('removebuffstack', 70, 1234, 99, TARGET, 1),
    ];
    const r = activeAurasAt(events, TARGET, 100);
    expect(r[0]!.stacks).toBe(1);
  });

  it('refreshbuff updates appliedAt but preserves stacks', () => {
    const events = [
      ev('applybuff', 50, 1234, 99, TARGET, 2),
      ev('applybuffstack', 55, 1234, 99, TARGET, 3),
      ev('refreshbuff', 80, 1234, 99),
    ];
    const r = activeAurasAt(events, TARGET, 100);
    expect(r[0]!.appliedAt).toBe(80);
    expect(r[0]!.stacks).toBe(3);
  });

  it('separate sources of the same aura are tracked independently', () => {
    const events = [
      ev('applybuff', 50, 1234, 99),
      ev('applybuff', 60, 1234, 100),
    ];
    const r = activeAurasAt(events, TARGET, 70);
    expect(r).toHaveLength(2);
    expect(new Set(r.map(a => a.sourceID))).toEqual(new Set([99, 100]));
  });

  it('events after T are ignored', () => {
    const events = [ev('applybuff', 50, 1234, 99), ev('removebuff', 150, 1234, 99)];
    const r = activeAurasAt(events, TARGET, 100);
    expect(r).toHaveLength(1);
  });

  it('events with a different target are ignored', () => {
    const events = [ev('applybuff', 50, 1234, 99, 999)];
    expect(activeAurasAt(events, TARGET, 100)).toHaveLength(0);
  });

  it('handles debuff variants identically', () => {
    const events = [
      { type: 'applydebuff', timestamp: 50, abilityGameID: 5, sourceID: 1, targetID: TARGET },
      { type: 'removedebuff', timestamp: 90, abilityGameID: 5, sourceID: 1, targetID: TARGET },
    ];
    expect(activeAurasAt(events, TARGET, 100)).toHaveLength(0);
    expect(activeAurasAt(events, TARGET, 60)).toHaveLength(1);
  });
});
