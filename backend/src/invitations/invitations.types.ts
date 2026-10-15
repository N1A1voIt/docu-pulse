export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  planId: string;
}

export interface InviteSummary {
  id: string;
  organizationId: string;
  inviterUserId: string;
  invitedEmail: string;
  roleId: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt: string | null;
  acceptedUserId: string | null;
}

export class InvitationError extends Error {
  code: string;
  status: number;
  extra?: Record<string, unknown>;
  constructor(code: string, message: string, status: number, extra?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.name = "InvitationError";
    this.status = status;
    this.extra = extra;
  }
}

export interface MemberSummary {
  id: string;
  seatId: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  roleId: string;
  user: { id: string; email: string; name: string };
}