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
