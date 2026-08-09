export interface EventsPageData {
  reportData?: {
    report?: {
      events?: { data?: unknown[]; nextPageTimestamp?: number | null } | null;
    } | null;
  } | null;
}

export const EVENTS_QUERY = /* GraphQL */ `
  query Events($code: String!, $fightId: Int!, $dataType: EventDataType!, $start: Float!, $end: Float!, $sourceID: Int, $targetID: Int, $abilityID: Float, $hostility: HostilityType, $limit: Int!) {
    reportData {
      report(code: $code) {
        events(fightIDs: [$fightId], dataType: $dataType, startTime: $start, endTime: $end, sourceID: $sourceID, targetID: $targetID, abilityID: $abilityID, hostilityType: $hostility, limit: $limit) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;
