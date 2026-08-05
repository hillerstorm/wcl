export const ENCOUNTER_LOOKUP = /* GraphQL */ `
  query EncounterLookup {
    worldData { expansions { id name zones { id name encounters { id name } } } }
  }
`;

// NOTE: no WCL instance (retail or classic-family) accepts a guildName argument on
// Encounter.characterRankings — the --guild flag is filtered client-side in search.ts.
export const SEARCH_QUERY = /* GraphQL */ `
  query Search($encounterId: Int!, $className: String, $spec: String, $difficulty: Int, $page: Int, $serverRegion: String, $serverSlug: String) {
    worldData {
      encounter(id: $encounterId) {
        name
        characterRankings(
          className: $className
          specName: $spec
          difficulty: $difficulty
          page: $page
          serverRegion: $serverRegion
          serverSlug: $serverSlug
        )
      }
    }
  }
`;
