import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { pool, resetSchema } from "./helpers/db.js";
import { createTeamOrganization } from "../src/organizations/organizations.service.js";
import { listOrganizationsForUser } from "../src/organizations/organizations.service.js";
import {
  createInvitation,
  acceptInvitation,
} from "../src/invitations/invitations.service.js";

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

async function insertUser(email: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO "users" ("uuid","name","email") VALUES (gen_random_uuid(), 'test', $1) RETURNING "id"`,
    [email],
  );
  return res.rows[0].id;
}

beforeAll(async () => {
  await resetSchema();
});
beforeEach(() => {
  captured.length = 0;
  emailThrows = false;
});

describe("invitations smoke", () => {
  it("creates a team org, invites a second user, accepts, and lists the org with two seats", async () => {
    const owner = await insertUser("owner@example.com");
    const org = await createTeamOrganization(owner, { name: "Acme" });

    await createInvitation(org.id, owner, { email: "invitee@example.com", role: "member" });
    const invitee = await insertUser("invitee@example.com");
    const token = new URL(captured[0]).searchParams.get("token")!;
    const result = await acceptInvitation(token, invitee, "invitee@example.com");
    expect(result.organization.id).toBe(org.id);

    const orgs = await listOrganizationsForUser(invitee);
    expect(orgs.map((o) => o.id)).toContain(org.id);

    const seats = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "seats" WHERE "id_organization" = $1`,
      [org.id],
    );
    expect(seats.rows[0].c).toBe("2");

    const inviteeSeat = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "seats" WHERE "id_user" = $1 AND "id_organization" = $2`,
      [invitee, org.id],
    );
    expect(inviteeSeat.rows[0].c).toBe("1");
  });
});
