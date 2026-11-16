export interface CharacterQueryData {
  characterData?: {
    character?: {
      id: number;
      name: string;
      classID: number;
      // zoneRankings is a JSON scalar in the WCL schema — no fixed shape.
      zoneRankings?: any;
    } | null;
  } | null;
}

export interface RankedCharactersQueryData {
  reportData?: {
    report?: {
      rankedCharacters?: ({ id: number; name?: string | null; server?: { slug?: string | null; region?: { slug?: string | null } | null } | null } | null)[] | null;
    } | null;
  } | null;
}

export const RANKED_CHARACTERS_QUERY = /* GraphQL */ `
  query RankedCharacters($code: String!) {
    reportData { report(code: $code) { rankedCharacters { id name server { slug region { slug } } } } }
  }
`;

// Looked up either by $id or by $name + $server + $region.
export const CHARACTER_QUERY = /* GraphQL */ `
  query Character($id: Int, $name: String, $server: String, $region: String, $zoneID: Int, $metric: CharacterPageRankingMetricType, $difficulty: Int, $size: Int, $specName: String, $partition: Int) {
    characterData {
      character(id: $id, name: $name, serverSlug: $server, serverRegion: $region) {
        id
        name
        classID
        zoneRankings(zoneID: $zoneID, metric: $metric, difficulty: $difficulty, size: $size, specName: $specName, partition: $partition)
      }
    }
  }
`;
