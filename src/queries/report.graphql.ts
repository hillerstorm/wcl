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
