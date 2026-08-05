export const CHARACTER_QUERY = /* GraphQL */ `
  query Character($name: String!, $server: String!, $region: String!, $zoneID: Int, $metric: CharacterPageRankingMetricType, $difficulty: Int, $size: Int, $specName: String, $partition: Int) {
    characterData {
      character(name: $name, serverSlug: $server, serverRegion: $region) {
        id
        name
        classID
        zoneRankings(zoneID: $zoneID, metric: $metric, difficulty: $difficulty, size: $size, specName: $specName, partition: $partition)
      }
    }
  }
`;
