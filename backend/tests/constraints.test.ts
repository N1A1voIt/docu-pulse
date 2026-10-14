import { describe, it, expect, beforeAll } from "vitest";
import { pool, resetSchema } from "./helpers/db.js";

describe("schema constraints", () => {
  beforeAll(async () => {
    await resetSchema();
  });

  it("proves every FK direction from pg metadata", async () => {
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }>(
      `SELECT tc.table_name,
              kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name
         FROM information_schema.table_constraints AS tc
         JOIN information_schema.key_column_usage AS kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage AS ccu
           ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'`,
    );

    const key = (r: {
      table_name: string;
      column_name: string;
      foreign_table_name: string;
      foreign_column_name: string;
    }) => `${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name}`;

    const found = new Set(rows.map(key));

    const expected = [
      "organizations.id_user -> users.id",
      "organizations.id_plan -> plans.id",
      "seats.id_user -> users.id",
      "seats.id_organization -> organizations.id_organization",
      "seats.id_role -> role.id_role",
      "integrations.id_pi -> possible_integration_docu.id_pi",
      "integrations.id_user_who_clicked_connect -> users.id",
      "integrations.id_organization -> organizations.id_organization",
    ];

    for (const e of expected) {
      expect(found.has(e), `missing FK: ${e}`).toBe(true);
    }
  });

  it("rejects a duplicate seat (id_user, id_organization)", async () => {
    const userRes = await pool.query<{ id: string }>(
      `INSERT INTO "users" ("uuid","name","email") VALUES (gen_random_uuid(),'u','u@example.com') RETURNING "id"`,
    );
    const userId = userRes.rows[0].id;
    const planRes = await pool.query<{ id: string }>(
      `SELECT "id" FROM "plans" WHERE "plan_name"='Free'`,
    );
    const planId = planRes.rows[0].id;
    const orgRes = await pool.query<{ id_organization: string }>(
      `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
       VALUES ('o','o','true',$1,$2) RETURNING "id_organization"`,
      [userId, planId],
    );
    const orgId = orgRes.rows[0].id_organization;
    const roleRes = await pool.query<{ id_role: string }>(
      `SELECT "id_role" FROM "role" WHERE "slug"='owner'`,
    );
    const roleId = roleRes.rows[0].id_role;

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

  it("accepts a 16-char slug and rejects a 17-char slug", async () => {
    const userRes = await pool.query<{ id: string }>(
      `INSERT INTO "users" ("uuid","name","email") VALUES (gen_random_uuid(),'u2','u2@example.com') RETURNING "id"`,
    );
    const userId = userRes.rows[0].id;
    const planRes = await pool.query<{ id: string }>(
      `SELECT "id" FROM "plans" WHERE "plan_name"='Free'`,
    );
    const planId = planRes.rows[0].id;

    await pool.query(
      `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
       VALUES ('a', repeat('a',16), 'false', $1, $2)`,
      [userId, planId],
    );

    await expect(
      pool.query(
        `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
         VALUES ('b', repeat('b',17), 'false', $1, $2)`,
        [userId, planId],
      ),
    ).rejects.toThrow();
  });
});
