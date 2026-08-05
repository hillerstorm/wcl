export const EVENTS_PROBE_QUERY = /* GraphQL */ `
  query EventsProbe($code: String!, $fightId: Int!) {
    reportData {
      report(code: $code) {
        fights(fightIDs: [$fightId]) { id name startTime endTime }
        masterData {
          actors { id name type subType petOwner }
          abilities { gameID name }
        }
      }
    }
  }
`;

export const EVENTS_QUERY = /* GraphQL */ `
  query Events($code: String!, $fightId: Int!, $dataType: EventDataType!, $start: Float!, $end: Float!, $sourceID: Int, $targetID: Int, $abilityID: Float, $limit: Int!) {
    reportData {
      report(code: $code) {
        events(fightIDs: [$fightId], dataType: $dataType, startTime: $start, endTime: $end, sourceID: $sourceID, targetID: $targetID, abilityID: $abilityID, limit: $limit) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;
