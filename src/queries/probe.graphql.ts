import type { ReportActor, ReportFight } from './report.graphql.js';

export interface ReportProbeData {
  reportData?: {
    report?: {
      fights?: ReportFight[];
      masterData?: { actors?: ReportActor[] } | null;
    } | null;
  } | null;
}

export interface ReportAbilitiesData {
  reportData?: {
    report?: {
      masterData?: { abilities?: { gameID: number; name?: string | null }[] } | null;
    } | null;
  } | null;
}

// playerDetails is a JSON scalar in the WCL schema — the inner role arrays have
// no fixed shape beyond id/name.
export interface PlayerDetailsData {
  reportData?: {
    report?: {
      playerDetails?: { data?: { playerDetails?: { dps?: any[]; healers?: any[]; tanks?: any[] } } } | null;
    } | null;
  } | null;
}

// One probe per report, shared by every command that needs fight windows or the
// actor list. Deliberately keyed on $code alone (all fights, no fightId variable)
// so the disk cache serves every fight of a report — and every command — from a
// single API call.
export const REPORT_PROBE_QUERY = /* GraphQL */ `
  query ReportProbe($code: String!) {
    reportData {
      report(code: $code) {
        fights { id name startTime endTime encounterID kill }
        masterData { actors { id name type subType petOwner } }
      }
    }
  }
`;

// The full ability list is large — fetched only when actually needed (--summary).
export const REPORT_ABILITIES_QUERY = /* GraphQL */ `
  query ReportAbilities($code: String!) {
    reportData {
      report(code: $code) {
        masterData { abilities { gameID name } }
      }
    }
  }
`;

export const PLAYER_DETAILS_QUERY = /* GraphQL */ `
  query PlayerDetails($code: String!, $fightId: Int!) {
    reportData {
      report(code: $code) {
        playerDetails(fightIDs: [$fightId])
      }
    }
  }
`;
