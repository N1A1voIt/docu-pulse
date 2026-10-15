import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { pool, resetSchema } from "./helpers/db.js";
import { createTeamOrganization, createPersonalOrganization } from "../src/organizations/organizations.service.js";
import {
  createInvitation,
  listInvitations,
  acceptInvitation,
  revokeInvitation,
  listMembers,
} from "../src/invitations/invitations.service.js";
import { InvitationError } from "../src/invitations/invitations.types.js";
import { generateInviteToken, hashToken, tokensEqual } from "../src/invitations/tokens.js";
import { Entitlements } from "../src/entitlements/canInvite.js";

const captured: string[] = [];
let emailThrows = false;

vi.mock("../src/email/index.js", () => ({
  createEmailSender: () => ({
    send: async () => {},
    sendInviteEmail: async (input: any) => {
      if (emailThrows) throw new Error("boom");
      captured.push(String(input.acceptUrl));
    },
  }),
}));

async function insertUserRaw(email: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO "users" ("uuid","name","email") VALUES (gen_random_uuid(), 'test', $1) RETURNING "id"`,
    [email],
  );
  return res.rows[0].id;
}

async function mkUser(tag: string = "user"): Promise<{ id: string; email: string }> {
  const email = `${tag}-${Math.random().toString(36).slice(2)}@example.com`;
  const id = await insertUserRaw(email);
  return { id, email };
}

function tokenFrom(url: string): string {
  return new URL(url).searchParams.get("token")!;
}

beforeAll(async () => {
  await resetSchema();
});

beforeEach(() => {
  captured.length = 0;
  emailThrows = false;
});

describe("invitations lifecycle", () => {
  it("creates invite without token fields and stores 64-hex hash", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    const invite = await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });

    expect(invite.invitedEmail).toBe(invitee.email);
    expect(invite.role).toBe("member");
    expect(invite.revokedAt).toBeNull();
    expect(invite.acceptedAt).toBeNull();
    expect(Object.keys(invite)).not.toContain("token");
    expect(Object.keys(invite)).not.toContain("tokenHash");
    expect(Object.keys(invite)).not.toContain("token_hash");

    const db = await pool.query<{ token_hash: string }>(
      `SELECT "token_hash" FROM "invitations" WHERE "id_invitation" = $1`,
      [invite.id],
    );
    expect(db.rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(captured).toHaveLength(1);
  });

  it("list includes pending, accepted, revoked", async () => {
    const owner = await mkUser("owner");
    const one = await mkUser("one");
    const two = await mkUser("two");
    const three = await mkUser("three");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });

    const i1 = await createInvitation(org.id, owner.id, { email: one.email, role: "member" });
    const i2 = await createInvitation(org.id, owner.id, { email: two.email, role: "admin" });
    await createInvitation(org.id, owner.id, { email: three.email, role: "member" });

    await acceptInvitation(tokenFrom(captured[0]), one.id, one.email);
    await revokeInvitation(org.id, owner.id, i2.id);

    const list = await listInvitations(org.id, owner.id);
    expect(list.length).toBeGreaterThanOrEqual(3);
    const byId = new Map(list.map((x) => [x.id, x]));
    expect(byId.get(i1.id)!.acceptedAt).not.toBeNull();
    expect(byId.get(i2.id)!.revokedAt).not.toBeNull();
  });

  it("revoke sets revoked_at", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    const invite = await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    await revokeInvitation(org.id, owner.id, invite.id);
    const list = await listInvitations(org.id, owner.id);
    expect(list[0].revokedAt).not.toBeNull();
  });

  it("accept returns organization", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const result = await acceptInvitation(tokenFrom(captured[0]), invitee.id, invitee.email);
    expect(result.organization.id).toBe(org.id);
    expect(result.organization.name).toBe("Acme");
  });

  it("email send failure rolls back, leaves no invite", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    emailThrows = true;
    const before = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM "invitations"`);
    await expect(
      createInvitation(org.id, owner.id, { email: invitee.email, role: "member" }),
    ).rejects.toMatchObject({ code: "EMAIL_SEND_FAILED", status: 502 });
    const after = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM "invitations"`);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  it("invalid email/role rejected", async () => {
    const owner = await mkUser("owner");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await expect(
      createInvitation(org.id, owner.id, { email: "not-an-email", role: "member" }),
    ).rejects.toMatchObject({ code: "INVALID_EMAIL", status: 400 });
    await expect(
      createInvitation(org.id, owner.id, { email: `${Math.random()}@example.com`, role: "bogus" }),
    ).rejects.toMatchObject({ code: "INVALID_ROLE", status: 400 });
  });
});

describe("role and subscription guards", () => {
  it("owner/admin can invite; member and nonmember cannot", async () => {
    const owner = await mkUser("owner");
    const adminUser = await mkUser("admin");
    const memberUser = await mkUser("member");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });

    await pool.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role","role_txt") VALUES ($1,$2,(SELECT "id_role" FROM "role" WHERE "slug"='admin'),'admin')`,
      [adminUser.id, org.id],
    );
    await pool.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role","role_txt") VALUES ($1,$2,(SELECT "id_role" FROM "role" WHERE "slug"='member'),'member')`,
      [memberUser.id, org.id],
    );

    await expect(createInvitation(org.id, owner.id, { email: await mkUser("a").then(u=>u.email), role: "member" })).resolves.toBeTruthy();
    await expect(createInvitation(org.id, adminUser.id, { email: await mkUser("b").then(u=>u.email), role: "member" })).resolves.toBeTruthy();
    await expect(createInvitation(org.id, memberUser.id, { email: await mkUser("c").then(u=>u.email), role: "member" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });

    const stranger = await mkUser("stranger");
    await expect(createInvitation(org.id, stranger.id, { email: await mkUser("d").then(u=>u.email), role: "member" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("unknown org returns 404", async () => {
    const user = await mkUser("u");
    await expect(createInvitation("999999", user.id, { email: `${Math.random()}@example.com`, role: "member" })).rejects.toMatchObject({ code: "ORG_NOT_FOUND", status: 404 });
  });

  it("personal org cannot invite", async () => {
    const owner = await mkUser("owner");
    const personal = await createPersonalOrganization(owner.id, "Owner");
    await expect(createInvitation(personal.id, owner.id, { email: `${Math.random()}@example.com`, role: "member" })).rejects.toMatchObject({ code: "SUBSCRIPTION_REQUIRED", status: 403 });
  });

  it("Entitlements.canInvite proxies", async () => {
    const owner = await mkUser("owner");
    const personal = await createPersonalOrganization(owner.id, "Owner");
    const team = await createTeamOrganization(owner.id, { name: "Team" });
    expect(await Entitlements.canInvite(personal.id)).toBe(false);
    expect(await Entitlements.canInvite(team.id)).toBe(true);
    expect(await Entitlements.canInvite("999999")).toBe(false);
  });

  it("GET invites/members access rules", async () => {
    const owner = await mkUser("owner");
    const member = await mkUser("member");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: await mkUser("x").then(u=>u.email), role: "member" });

    await pool.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role","role_txt") VALUES ($1,$2,(SELECT "id_role" FROM "role" WHERE "slug"='member'),'member')`,
      [member.id, org.id],
    );
    await expect(listInvitations(org.id, member.id)).resolves.toBeInstanceOf(Array);
    await expect(listMembers(org.id, member.id)).resolves.toBeInstanceOf(Array);

    const stranger = await mkUser("stranger");
    await expect(listInvitations(org.id, stranger.id)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(listMembers(org.id, stranger.id)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("unknown org list/members returns 404", async () => {
    const user = await mkUser("u");
    await expect(listInvitations("999999", user.id)).rejects.toMatchObject({ code: "ORG_NOT_FOUND", status: 404 });
    await expect(listMembers("999999", user.id)).rejects.toMatchObject({ code: "ORG_NOT_FOUND", status: 404 });
  });
});

describe("token security", () => {
  it("stored hash equals generated token sha256", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const token = tokenFrom(captured[0]);
    const db = await pool.query<{ token_hash: string }>(`SELECT "token_hash" FROM "invitations"`);
    expect(db.rows.some((r) => r.token_hash === hashToken(token))).toBe(true);
    expect(tokensEqual(hashToken(token), hashToken(token))).toBe(true);
    expect(generateInviteToken().hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("tokensEqual mismatched lengths", () => {
    expect(tokensEqual("abcd", "ab")).toBe(false);
    expect(tokensEqual("abcd", "abcd")).toBe(true);
  });

  it("list has no token fields", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const list = await listInvitations(org.id, owner.id);
    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("tokenHash");
  });

  it("invalid token fails", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const before = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM "seats"`);
    await expect(acceptInvitation("does-not-exist", invitee.id, invitee.email)).rejects.toMatchObject({ code: "INVITE_INVALID", status: 400 });
    const after = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM "seats"`);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });
});

describe("accept validation", () => {
  it("expired fails", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    const invite = await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const token = tokenFrom(captured[0]);
    await pool.query(`UPDATE "invitations" SET "expires_at" = now() - interval '1 day' WHERE "id_invitation" = $1`, [invite.id]);
    const before = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM "seats" WHERE "id_organization" = $1`, [org.id]);
    await expect(acceptInvitation(token, invitee.id, invitee.email)).rejects.toMatchObject({ code: "INVITE_INVALID", status: 400 });
    const after = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM "seats" WHERE "id_organization" = $1`, [org.id]);
    expect(after.rows[0].c).toBe(before.rows[0].c);
  });

  it("revoked fails", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    const invite = await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const token = tokenFrom(captured[0]);
    await revokeInvitation(org.id, owner.id, invite.id);
    await expect(acceptInvitation(token, invitee.id, invitee.email)).rejects.toMatchObject({ code: "INVITE_INVALID", status: 400 });
    const seats = await pool.query<{ c: string }>(`SELECT count(*)::text AS c FROM "seats" WHERE "id_organization" = $1`, [org.id]);
    expect(Number(seats.rows[0].c)).toBeGreaterThanOrEqual(1);
  });

  it("double accept idempotent", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const token = tokenFrom(captured[0]);
    await acceptInvitation(token, invitee.id, invitee.email);
    const first = (await pool.query<{ accepted_at: Date }>(`SELECT "accepted_at" FROM "invitations" WHERE "invited_email" = $1`, [invitee.email])).rows[0].accepted_at;
    await acceptInvitation(token, invitee.id, invitee.email);
    const second = (await pool.query<{ accepted_at: Date }>(`SELECT "accepted_at" FROM "invitations" WHERE "invited_email" = $1`, [invitee.email])).rows[0].accepted_at;
    expect(second.getTime()).toBe(first.getTime());
  });

  it("cross-email mismatch returns EMAIL_MISMATCH with sign-in path", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const other = await mkUser("other");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const token = tokenFrom(captured[0]);
    let err: InvitationError | null = null;
    try {
      await acceptInvitation(token, other.id, other.email);
    } catch (e) {
      err = e as InvitationError;
    }
    expect(err).not.toBeNull();
    expect(err!.code).toBe("EMAIL_MISMATCH");
    expect(err!.status).toBe(400);
    expect(err!.extra?.signInPath).toBe(
      `/sign-in?next=${encodeURIComponent(`/invites/accept?token=${encodeURIComponent(token)}`)}`,
    );
    expect(err!.message).toContain(invitee.email);
  });

  it("creates one seat with invited role", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "admin" });
    const token = tokenFrom(captured[0]);
    await acceptInvitation(token, invitee.id, invitee.email);
    const seat = await pool.query<{ slug: string }>(
      `SELECT r."slug" FROM "seats" s JOIN "role" r ON r."id_role"=s."id_role" WHERE s."id_user"=$1 AND s."id_organization"=$2`,
      [invitee.id, org.id],
    );
    expect(seat.rows[0].slug).toBe("admin");
    const count = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "seats" WHERE "id_user"=$1 AND "id_organization"=$2`,
      [invitee.id, org.id],
    );
    expect(count.rows[0].c).toBe("1");
  });

  it("accept resolves email from users table when omitted", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const token = tokenFrom(captured[0]);
    const result = await acceptInvitation(token, invitee.id);
    expect(result.organization.id).toBe(org.id);
  });

  it("members list joins seats to users and roles", async () => {
    const owner = await mkUser("owner");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    const token = tokenFrom(captured[0]);
    await acceptInvitation(token, invitee.id, invitee.email);
    const members = await listMembers(org.id, owner.id);
    expect(members.length).toBeGreaterThanOrEqual(2);
    const inviteeMember = members.find((m) => m.userId === invitee.id);
    expect(inviteeMember!.user.email).toBe(invitee.email);
    expect(inviteeMember!.role).toBe("member");
  });

  it("revoke unknown invite", async () => {
    const owner = await mkUser("owner");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    await expect(revokeInvitation(org.id, owner.id, "999999")).rejects.toMatchObject({ code: "INVITE_NOT_FOUND", status: 404 });
  });

  it("revoke by non-admin forbidden", async () => {
    const owner = await mkUser("owner");
    const stranger = await mkUser("stranger");
    const invitee = await mkUser("invitee");
    const org = await createTeamOrganization(owner.id, { name: "Acme" });
    const invite = await createInvitation(org.id, owner.id, { email: invitee.email, role: "member" });
    await expect(revokeInvitation(org.id, stranger.id, invite.id)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
