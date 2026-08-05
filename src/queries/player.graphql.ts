export const PLAYER_QUERY = /* GraphQL */ `
  query Player($code: String!, $fightId: Int!, $start: Float!, $end: Float!) {
    reportData {
      report(code: $code) {
        masterData { actors { id name type subType } abilities { gameID name } }
        playerDetails(fightIDs: [$fightId])
        casts: events(dataType: Casts, startTime: $start, endTime: $end) { data }
        damage: events(dataType: DamageDone, startTime: $start, endTime: $end) { data }
        buffs: events(dataType: Buffs, startTime: $start, endTime: $end) { data }
      }
    }
  }
`;
