export interface Organization {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  planId: string;
}

export interface CreateTeamOrgInput {
  name: string;
  slug?: string;
}
