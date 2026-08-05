export interface RawAuraEvent {
  type: string;
  timestamp: number;
  abilityGameID: number;
  sourceID?: number | undefined;
  targetID: number;
  stack?: number | undefined;
}

export interface ActiveAura {
  abilityGameID: number;
  sourceID: number | undefined;
  appliedAt: number;
  stacks: number;
}

const APPLY = new Set(['applybuff', 'applydebuff']);
const APPLY_STACK = new Set(['applybuffstack', 'applydebuffstack']);
const REFRESH = new Set(['refreshbuff', 'refreshdebuff']);
const REMOVE_STACK = new Set(['removebuffstack', 'removedebuffstack']);
const REMOVE = new Set(['removebuff', 'removedebuff']);

function keyOf(e: { abilityGameID: number; sourceID?: number | undefined }): string {
  return `${e.abilityGameID}:${e.sourceID ?? 'none'}`;
}

export function activeAurasAt(events: readonly RawAuraEvent[], targetID: number, t: number): ActiveAura[] {
  const state = new Map<string, ActiveAura>();
  for (const e of events) {
    if (e.targetID !== targetID) continue;
    if (e.timestamp > t) break;

    const k = keyOf(e);
    if (APPLY.has(e.type)) {
      state.set(k, { abilityGameID: e.abilityGameID, sourceID: e.sourceID, appliedAt: e.timestamp, stacks: e.stack ?? 1 });
    } else if (APPLY_STACK.has(e.type)) {
      const existing = state.get(k);
      if (existing) existing.stacks = e.stack ?? existing.stacks + 1;
      else state.set(k, { abilityGameID: e.abilityGameID, sourceID: e.sourceID, appliedAt: e.timestamp, stacks: e.stack ?? 1 });
    } else if (REFRESH.has(e.type)) {
      const existing = state.get(k);
      if (existing) existing.appliedAt = e.timestamp;
      else state.set(k, { abilityGameID: e.abilityGameID, sourceID: e.sourceID, appliedAt: e.timestamp, stacks: 1 });
    } else if (REMOVE_STACK.has(e.type)) {
      const existing = state.get(k);
      if (existing) existing.stacks = (e.stack ?? existing.stacks - 1);
    } else if (REMOVE.has(e.type)) {
      state.delete(k);
    }
  }
  return [...state.values()];
}
