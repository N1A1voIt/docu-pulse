import { describe, it, expect, beforeEach } from "vitest";
import { pool, resetSchema } from "./helpers/db.js";
import {
  createPersonalOrganization,
  createTeamOrganization,
  listOrganizationsForUser,
} from "../src/organizations/organizations.service.js";

describe("organizations service", () => {
  beforeEach(async () => {
    await resetSchema();
  });

  async function insertUser(email: string): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO "users" ("uuid","name","email") VALUES (gen_random_uuid(), 'test', $1) RETURNING "id"`,
      [email],
    );
    return res.rows[0].id;
  }

  it("auto-creates a personal org with a sole owner seat", async () => {
    const userId = await insertUser("personal@example.com");
    const org = await createPersonalOrganization(userId, "Alice");

    expect(org.isPersonal).toBe(true);
    const orgs = await listOrganizationsForUser(userId);
    expect(orgs).toHaveLength(1);
    expect(orgs[0].id).toBe(org.id);

    const seats = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "seats" WHERE "id_organization" = $1`,
      [org.id],
    );
    expect(seats.rows[0].c).toBe("1");
  });

  it("creates a team org with the Org plan and an owner seat", async () => {
    const userId = await insertUser("owner@example.com");
    const org = await createTeamOrganization(userId, { name: "Acme" });

    expect(org.isPersonal).toBe(false);
    expect(org.id).toBeTruthy();

    const plan = await pool.query<{ plan_name: string }>(
      `SELECT p."plan_name" FROM "organizations" o JOIN "plans" p ON p."id"=o."id_plan" WHERE o."id_organization"=$1`,
      [org.id],
    );
    expect(plan.rows[0].plan_name).toBe("Org");

    const seats = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "seats" WHERE "id_organization"=$1`,
      [org.id],
    );
    expect(seats.rows[0].c).toBe("1");
  });

  it("lists multiple orgs for a user", async () => {
    const userId = await insertUser("multi@example.com");
    await createPersonalOrganization(userId, "Multi");
    await createTeamOrganization(userId, { name: "Team" });

    const orgs = await listOrganizationsForUser(userId);
    expect(orgs).toHaveLength(2);
  });
});
