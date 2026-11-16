export interface LookupExpansion {
  id: number;
  name?: string | null;
  zones?: { id: number; name?: string | null; encounters?: { id: number; name?: string | null }[] | null }[] | null;
}

export interface EncounterLookupData {
  worldData?: { expansions?: LookupExpansion[] | null } | null;
}

export interface ExpansionEncounterLookupData {
  worldData?: { expansion?: LookupExpansion | null } | null;
}

export interface SearchQueryData {
  worldData?: {
    encounter?: {
      name?: string | null;
      // characterRankings is a JSON scalar in the WCL schema — no fixed shape.
      // On failure it is { error: string } instead (see jsonScalarError).
      characterRankings?: { rankings?: any[]; page?: number; hasMorePages?: boolean } | null;
    } | null;
  } | null;
}

export const ENCOUNTER_LOOKUP = /* GraphQL */ `
  query EncounterLookup {
    worldData { expansions { id name zones { id name encounters { id name } } } }
  }
`;

// For instances with an INSTANCE_EXPANSION_ID: worldData.expansions would not list their game.
export const EXPANSION_ENCOUNTER_LOOKUP = /* GraphQL */ `
  query ExpansionEncounterLookup($expansionId: Int!) {
    worldData { expansion(id: $expansionId) { id name zones { id name encounters { id name } } } }
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
