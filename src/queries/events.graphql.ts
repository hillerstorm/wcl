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
