import { describe, it, expect, beforeEach } from "vitest";
import { pool, resetSchema } from "./helpers/db.js";

describe("provisioning round-trip", () => {
  beforeEach(async () => {
    await resetSchema();
  });

  it("inserts user -> personal org -> sole seat with all FKs satisfied", async () => {
    const userRes = await pool.query<{ id: string }>(
      `INSERT INTO "users" ("uuid","name","email")
       VALUES (gen_random_uuid(),'alice','alice@example.com') RETURNING "id"`,
    );
    const userId = userRes.rows[0].id;

    const planRes = await pool.query<{ id: string }>(
      `SELECT "id" FROM "plans" WHERE "plan_name"='Free'`,
    );
    const planId = planRes.rows[0].id;

    const orgRes = await pool.query<{ id_organization: string; is_personal: boolean }>(
      `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
       VALUES ('Alice personal','ap','true',$1,$2) RETURNING "id_organization","is_personal"`,
      [userId, planId],
    );
    const orgId = orgRes.rows[0].id_organization;
    expect(orgRes.rows[0].is_personal).toBe(true);

    const roleRes = await pool.query<{ id_role: string }>(
      `SELECT "id_role" FROM "role" WHERE "slug"='owner'`,
    );
    const roleId = roleRes.rows[0].id_role;

    await pool.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role","role_txt")
       VALUES ($1,$2,$3,'owner')`,
      [userId, orgId, roleId],
    );

    const seats = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "seats" WHERE "id_user"=$1 AND "id_organization"=$2`,
      [userId, orgId],
    );
    expect(seats.rows[0].c).toBe("1");
  });

  it("rejects a second seat for the same (user, org) pair", async () => {
    const userRes = await pool.query<{ id: string }>(
      `INSERT INTO "users" ("uuid","name","email") VALUES (gen_random_uuid(),'bob','bob@example.com') RETURNING "id"`,
    );
    const userId = userRes.rows[0].id;
    const planId = (
      await pool.query<{ id: string }>(
        `SELECT "id" FROM "plans" WHERE "plan_name"='Free'`,
      )
    ).rows[0].id;
    const orgId = (
      await pool.query<{ id_organization: string }>(
        `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
         VALUES ('bob personal','bp','true',$1,$2) RETURNING "id_organization"`,
        [userId, planId],
      )
    ).rows[0].id_organization;
    const roleId = (
      await pool.query<{ id_role: string }>(
        `SELECT "id_role" FROM "role" WHERE "slug"='owner'`,
      )
    ).rows[0].id_role;

    await pool.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role") VALUES ($1,$2,$3)`,
      [userId, orgId, roleId],
    );

    await expect(
      pool.query(
        `INSERT INTO "seats" ("id_user","id_organization","id_role") VALUES ($1,$2,$3)`,
        [userId, orgId, roleId],
      ),
    ).rejects.toThrow();
  });

  it("rejects an org referencing a non-existent plan", async () => {
    const userRes = await pool.query<{ id: string }>(
      `INSERT INTO "users" ("uuid","name","email") VALUES (gen_random_uuid(),'carol','carol@example.com') RETURNING "id"`,
    );
    const userId = userRes.rows[0].id;

    await expect(
      pool.query(
        `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
         VALUES ('bad','bad','false',$1,999999)`,
        [userId],
      ),
    ).rejects.toThrow();
  });
});
