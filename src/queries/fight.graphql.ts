import type { ReportFight } from './report.graphql.js';

export interface FightQueryData {
  reportData?: {
    report?: {
      fights?: (ReportFight & { friendlyPlayers?: number[] | null; enemyNPCs?: { id: number; gameID: number }[] | null })[];
      table?: { data?: unknown } | null;
    } | null;
  } | null;
}

export const FIGHT_QUERY = /* GraphQL */ `
  query Fight($code: String!, $fightId: Int!) {
    reportData {
      report(code: $code) {
        fights(fightIDs: [$fightId]) { id name encounterID startTime endTime kill difficulty size friendlyPlayers enemyNPCs { id gameID } }
        table(fightIDs: [$fightId], dataType: DamageDone)
      }
    }
  }
`;
