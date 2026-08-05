export const PLAYER_META_QUERY = /* GraphQL */ `
  query PlayerMeta($code: String!, $fightId: Int!) {
    reportData {
      report(code: $code) {
        fights(fightIDs: [$fightId]) { id startTime endTime }
        masterData { actors { id name type subType } }
        playerDetails(fightIDs: [$fightId])
      }
    }
  }
`;
