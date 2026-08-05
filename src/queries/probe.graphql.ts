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
