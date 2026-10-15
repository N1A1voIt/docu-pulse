import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { getOrganizationById, getMemberRole } from "../organizations/organizations.service.js";
import type { Organization } from "../organizations/types.js";
import { canInvite } from "../entitlements/canInvite.js";
import { generateInviteToken, hashToken, tokensEqual } from "./tokens.js";
import { getRoleIdBySlug, isValidRole, normalizeRoleSlug } from "./roles.js";
import { createEmailSender } from "../email/index.js";
import { env } from "../config/env.js";
import {
  InvitationError,
  type InviteSummary,
  type MemberSummary,
  type OrganizationSummary,
} from "./invitations.types.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function emailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export interface CreateInvitationInput {
  email: string;
  role: string;
}

export async function createInvitation(
  orgId: string,
  inviterUserId: string,
  input: CreateInvitationInput | string,
  maybeRole?: string,
): Promise<InviteSummary> {
  const email = typeof input === "string" ? input : input.email;
  const role = typeof input === "string" ? (maybeRole ?? "") : input.role;

  const org = await getOrganizationById(orgId);
  if (!org) throw new InvitationError("ORG_NOT_FOUND", "Organization not found", 404);

  const inviterRole = await getMemberRole(orgId, inviterUserId);
  if (!inviterRole) throw new InvitationError("FORBIDDEN", "Not a member of this organization", 403);
  if (inviterRole !== "owner" && inviterRole !== "admin") {
    throw new InvitationError("FORBIDDEN", "Only owners and admins can invite", 403);
  }

  if (!(await canInvite(orgId))) {
    throw new InvitationError("SUBSCRIPTION_REQUIRED", "This organization cannot send invites", 403);
  }

  const trimmedEmail = (email ?? "").trim();
  if (!emailValid(trimmedEmail)) {
    throw new InvitationError("INVALID_EMAIL", "Invalid email address", 400);
  }
  const roleSlug = normalizeRoleSlug(role);
  if (!isValidRole(roleSlug)) {
    throw new InvitationError("INVALID_ROLE", "Invalid role", 400);
  }

  const roleId = await getRoleIdBySlug(roleSlug);
  const { token, hash } = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");
    const insertRes = await client.query<{
      id_invitation: string | number;
      id_organization: string | number;
      id_inviter_user: string | number;
      invited_email: string;
      id_role: string | number;
      created_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
      accepted_at: Date | null;
      accepted_user_id: string | number | null;
    }>(
      `INSERT INTO "invitations"
        ("id_organization","id_inviter_user","invited_email","id_role","token_hash","expires_at")
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING "id_invitation","id_organization","id_inviter_user","invited_email","id_role","created_at","expires_at","revoked_at","accepted_at","accepted_user_id"`,
      [orgId, inviterUserId, trimmedEmail, roleId, hash, expiresAt],
    );
    const row = insertRes.rows[0];

    const acceptUrl = `${env.appUrl}/invites/accept?token=${encodeURIComponent(token)}`;
    const sender = createEmailSender();
    try {
      await sender.sendInviteEmail({
        to: trimmedEmail,
        orgName: org.name,
        role: roleSlug,
        acceptUrl,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      throw new InvitationError("EMAIL_SEND_FAILED", "Failed to send invitation email", 502);
    }

    await client.query("COMMIT");

    return {
      id: String(row.id_invitation),
      organizationId: String(row.id_organization),
      inviterUserId: String(row.id_inviter_user),
      invitedEmail: row.invited_email,
      roleId: String(row.id_role),
      role: roleSlug,
      createdAt: toIso(row.created_at)!,
      expiresAt: toIso(row.expires_at)!,
      revokedAt: toIso(row.revoked_at),
      acceptedAt: toIso(row.accepted_at),
      acceptedUserId: row.accepted_user_id === null ? null : String(row.accepted_user_id),
    };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    if (err instanceof InvitationError) throw err;
    throw err;
  } finally {
    client.release();
  }
}

export async function listInvitations(
  orgId: string,
  viewerUserId?: string,
): Promise<InviteSummary[]> {
  const org = await getOrganizationById(orgId);
  if (!org) throw new InvitationError("ORG_NOT_FOUND", "Organization not found", 404);
  if (viewerUserId) {
    const role = await getMemberRole(orgId, viewerUserId);
    if (!role) throw new InvitationError("FORBIDDEN", "Not a member of this organization", 403);
  }
  const res = await pool.query<{
    id_invitation: string | number;
    id_organization: string | number;
    id_inviter_user: string | number;
    invited_email: string;
    id_role: string | number;
    role_slug: string;
    created_at: Date;
    expires_at: Date;
    revoked_at: Date | null;
    accepted_at: Date | null;
    accepted_user_id: string | number | null;
  }>(
    `SELECT i."id_invitation", i."id_organization", i."id_inviter_user", i."invited_email",
            i."id_role", r."slug" AS role_slug, i."created_at", i."expires_at",
            i."revoked_at", i."accepted_at", i."accepted_user_id"
       FROM "invitations" i
       JOIN "role" r ON r."id_role" = i."id_role"
      WHERE i."id_organization" = $1
      ORDER BY i."created_at" DESC`,
    [orgId],
  );
  return res.rows.map((row) => ({
    id: String(row.id_invitation),
    organizationId: String(row.id_organization),
    inviterUserId: String(row.id_inviter_user),
    invitedEmail: row.invited_email,
    roleId: String(row.id_role),
    role: row.role_slug,
    createdAt: toIso(row.created_at)!,
    expiresAt: toIso(row.expires_at)!,
    revokedAt: toIso(row.revoked_at),
    acceptedAt: toIso(row.accepted_at),
    acceptedUserId: row.accepted_user_id === null ? null : String(row.accepted_user_id),
  }));
}

export async function getInvitationByTokenHash(token: string) {
  const hash = hashToken(token);
  const res = await pool.query<{
    id_invitation: string | number;
    id_organization: string | number;
    id_inviter_user: string | number;
    invited_email: string;
    id_role: string | number;
    token_hash: string;
    created_at: Date;
    expires_at: Date;
    revoked_at: Date | null;
    accepted_at: Date | null;
    accepted_user_id: string | number | null;
    role_slug: string;
  }>(
    `SELECT i.*, r."slug" AS role_slug
       FROM "invitations" i JOIN "role" r ON r."id_role"=i."id_role"
      WHERE i."token_hash" = $1`,
    [hash],
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  if (!tokensEqual(hash, row.token_hash)) return null;
  return row;
}

export async function acceptInvitation(
  token: string,
  acceptingUserId: string,
  acceptingEmail?: string,
): Promise<{ organization: OrganizationSummary }> {
  const hash = hashToken(token);

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    const invRes = await client.query<{
      id_invitation: string | number;
      id_organization: string | number;
      id_inviter_user: string | number;
      invited_email: string;
      id_role: string | number;
      token_hash: string;
      created_at: Date;
      expires_at: Date;
      revoked_at: Date | null;
      accepted_at: Date | null;
      accepted_user_id: string | number | null;
      role_slug: string;
    }>(
      `SELECT i."id_invitation", i."id_organization", i."id_inviter_user", i."invited_email",
              i."id_role", i."token_hash", i."created_at", i."expires_at",
              i."revoked_at", i."accepted_at", i."accepted_user_id", r."slug" AS role_slug
         FROM "invitations" i
         JOIN "role" r ON r."id_role" = i."id_role"
        WHERE i."token_hash" = $1
        FOR UPDATE`,
      [hash],
    );

    if (invRes.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new InvitationError("INVITE_INVALID", "Invitation is invalid or expired", 400);
    }

    const row = invRes.rows[0];
    if (!tokensEqual(hash, row.token_hash)) {
      await client.query("ROLLBACK");
      throw new InvitationError("INVITE_INVALID", "Invitation is invalid or expired", 400);
    }

    const now = new Date();
    if (row.revoked_at) {
      await client.query("ROLLBACK");
      throw new InvitationError("INVITE_INVALID", "Invitation is invalid or expired", 400);
    }
    if (new Date(row.expires_at) < now) {
      await client.query("ROLLBACK");
      throw new InvitationError("INVITE_INVALID", "Invitation is invalid or expired", 400);
    }

    let emailToCompare = acceptingEmail;
    if (!emailToCompare) {
      const u = await client.query<{ email: string }>(
        `SELECT "email" FROM "users" WHERE "id" = $1`,
        [acceptingUserId],
      );
      emailToCompare = u.rows[0]?.email;
    }

    if (
      String(row.invited_email).toLowerCase() !==
      String(emailToCompare ?? "").toLowerCase()
    ) {
      await client.query("ROLLBACK");
      const nextPath = `/invites/accept?token=${encodeURIComponent(token)}`;
      throw new InvitationError(
        "EMAIL_MISMATCH",
        `This invitation was sent to ${row.invited_email}. Sign in as that email to accept.`,
        400,
        { signInPath: `/sign-in?next=${encodeURIComponent(nextPath)}` },
      );
    }

    const orgRes = await client.query<{
      id_organization: string;
      organization_name: string;
      slug: string;
      is_personal: boolean;
      id_plan: string;
    }>(
      `SELECT "id_organization","organization_name","slug","is_personal","id_plan"
         FROM "organizations" WHERE "id_organization" = $1`,
      [row.id_organization],
    );
    if (orgRes.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new InvitationError("INVITE_INVALID", "Invitation is invalid or expired", 400);
    }
    const orgRow = orgRes.rows[0];

    const roleId = String(row.id_role);
    const alreadyAccepted = !!row.accepted_at;

    await client.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role","role_txt")
       VALUES ($1,$2,$3,$4)
       ON CONFLICT ("id_user","id_organization") DO NOTHING`,
      [acceptingUserId, row.id_organization, roleId, row.role_slug],
    );

    if (!alreadyAccepted) {
      await client.query(
        `UPDATE "invitations"
            SET "accepted_at" = now(), "accepted_user_id" = $1
          WHERE "id_invitation" = $2 AND "accepted_at" IS NULL`,
        [acceptingUserId, row.id_invitation],
      );
    }

    await client.query("COMMIT");

    return {
      organization: {
        id: String(orgRow.id_organization),
        name: orgRow.organization_name,
        slug: orgRow.slug,
        isPersonal: orgRow.is_personal,
        planId: String(orgRow.id_plan),
      },
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    if (err instanceof InvitationError) throw err;
    throw err;
  } finally {
    client.release();
  }
}

export async function revokeInvitation(
  orgId: string,
  managerUserId: string,
  inviteId: string,
): Promise<void> {
  const org = await getOrganizationById(orgId);
  if (!org) throw new InvitationError("ORG_NOT_FOUND", "Organization not found", 404);
  const managerRole = await getMemberRole(orgId, managerUserId);
  if (!managerRole || (managerRole !== "owner" && managerRole !== "admin")) {
    throw new InvitationError("FORBIDDEN", "Only owners and admins can revoke invites", 403);
  }
  const res = await pool.query<{ id_invitation: string }>(
    `UPDATE "invitations" SET "revoked_at" = now()
      WHERE "id_invitation" = $1 AND "id_organization" = $2
      RETURNING "id_invitation"`,
    [inviteId, orgId],
  );
  if (res.rows.length === 0) {
    throw new InvitationError("INVITE_NOT_FOUND", "Invitation not found", 404);
  }
}

export async function listMembers(
  orgId: string,
  viewerUserId?: string,
): Promise<MemberSummary[]> {
  const org = await getOrganizationById(orgId);
  if (!org) throw new InvitationError("ORG_NOT_FOUND", "Organization not found", 404);
  if (viewerUserId) {
    const role = await getMemberRole(orgId, viewerUserId);
    if (!role) throw new InvitationError("FORBIDDEN", "Not a member of this organization", 403);
  }
  const res = await pool.query<{
    id_seat: string | number;
    id_user: string | number;
    email: string;
    name: string;
    role_slug: string;
    id_role: string | number;
  }>(
    `SELECT s."id_seat", s."id_user", u."email", u."name", r."slug" AS role_slug, s."id_role"
       FROM "seats" s
       JOIN "users" u ON u."id" = s."id_user"
       JOIN "role" r ON r."id_role" = s."id_role"
      WHERE s."id_organization" = $1`,
    [orgId],
  );
  return res.rows.map((row) => {
    const uid = String(row.id_user);
    const email = row.email;
    const name = row.name;
    const role = row.role_slug;
    return {
      id: String(row.id_seat),
      seatId: String(row.id_seat),
      userId: uid,
      email,
      name,
      role,
      roleId: String(row.id_role),
      user: { id: uid, email, name },
    };
  });
}

// aliases
export const createInvite = createInvitation;
export const createInvitationForOrg = createInvitation;
export const listInvites = listInvitations;
export const listInvitesForOrganization = listInvitations;
export const listInvitationsForOrganization = listInvitations;
export const listInvitationsForOrg = listInvitations;
export const acceptInvite = acceptInvitation;
export const acceptInviteByToken = acceptInvitation;
export const acceptInvitationByToken = acceptInvitation;
export const revokeInvite = revokeInvitation;
export const revokeInvitationById = revokeInvitation;
export const getMembers = listMembers;
export const listOrganizationMembers = listMembers;
export const listOrgMembers = listMembers;
export const getInvitation = getInvitationByTokenHash;
export const getInvitationByToken = getInvitationByTokenHash;

export const invitationsService = {
  createInvitation, createInvite,
  listInvitations, listInvites,
  acceptInvitation, acceptInvite,
  revokeInvitation, revokeInvite,
  listMembers, getMembers,
};

export default invitationsService;