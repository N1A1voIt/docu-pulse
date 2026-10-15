export interface Organization {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  planId: string;
}

/**
 * An organization as seen by one specific viewer (the list endpoint).
 *
 * `planName` and `role` are viewer-relative convenience fields: `role` is the
 * calling user's seat role for that org, so it only has meaning in a per-user
 * listing. Creation/lookup paths keep returning plain `Organization`.
 */
export interface OrganizationForUser extends Organization {
  /** plans.plan_name for this org's plan, or null if the plan row is missing. */
  planName: string | null;
  /** role.slug for the viewer's seat in this org, or null if the seat has no role. */
  role: string | null;
}

export interface CreateTeamOrgInput {
  name: string;
  slug?: string;
}
