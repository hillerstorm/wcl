export interface ReportFight {
  id: number;
  name?: string | null;
  encounterID?: number | null;
  startTime: number;
  endTime: number;
  kill?: boolean | null;
  difficulty?: number | null;
  size?: number | null;
}

export interface ReportActor {
  id: number;
  name?: string | null;
  type?: string | null;
  subType?: string | null;
  petOwner?: number | null;
}

export interface ReportAbility {
  gameID: number;
  name?: string | null;
  icon?: string | null;
  type?: string | null;
}

export interface Report {
  code: string;
  title?: string | null;
  startTime: number;
  endTime: number;
  zone?: { id: number; name?: string | null } | null;
  owner?: { id: number; name?: string | null } | null;
  fights?: ReportFight[];
  masterData?: { actors?: ReportActor[]; abilities?: ReportAbility[] } | null;
}

export interface ReportQueryData {
  reportData?: { report?: Report | null } | null;
}

export const REPORT_QUERY = /* GraphQL */ `
  query Report($code: String!) {
    reportData {
      report(code: $code) {
        code title startTime endTime zone { id name }
        owner { id name }
        fights { id name encounterID startTime endTime kill difficulty size }
        masterData {
          actors { id name type subType petOwner }
          abilities { gameID name icon type }
        }
      }
    }
  }
`;
