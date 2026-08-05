export const CAST_SNAPSHOT_QUERY = /* GraphQL */ `
  query CastSnapshot($code: String!, $fightId: Int!, $start: Float!, $end: Float!) {
    reportData {
      report(code: $code) {
        fights(fightIDs: [$fightId]) { id startTime endTime encounterID kill }
        playerDetails(fightIDs: [$fightId])
        casts: events(dataType: Casts, fightIDs: [$fightId], startTime: $start, endTime: $end) { data }
        damage: events(dataType: DamageDone, fightIDs: [$fightId], startTime: $start, endTime: $end) { data }
        buffs: events(dataType: Buffs, fightIDs: [$fightId], startTime: $start, endTime: $end) { data }
        debuffs: events(dataType: Debuffs, fightIDs: [$fightId], startTime: $start, endTime: $end) { data }
      }
    }
  }
`;
