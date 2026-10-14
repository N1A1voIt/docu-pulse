import { describe, it, expect, beforeAll } from "vitest";
import { pool, resetSchema } from "./helpers/db.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedSql = fs.readFileSync(
  path.join(__dirname, "..", "db", "migrations", "0002_seed.sql"),
  "utf8",
);

describe("seeds", () => {
  beforeAll(async () => {
    await resetSchema();
  });

  it("has exactly 2 plans: Free ($0) and Org ($20)", async () => {
    const { rows } = await pool.query<{ plan_name: string; price_per_seat: string }>(
      `SELECT "plan_name", "price_per_seat"::text AS price_per_seat FROM "plans" ORDER BY "plan_name"`,
    );
    expect(rows).toHaveLength(2);
    const free = rows.find((r: { plan_name: string }) => r.plan_name === "Free");
    const org = rows.find((r: { plan_name: string }) => r.plan_name === "Org");
    expect(free?.price_per_seat).toBe("0");
    expect(org?.price_per_seat).toBe("20");
  });

  it("has exactly 3 roles: owner, admin, member", async () => {
    const { rows } = await pool.query<{ role: string }>(
      `SELECT "role" FROM "role" ORDER BY "role"`,
    );
    expect(rows.map((r: { role: string }) => r.role)).toEqual([
      "admin",
      "member",
      "owner",
    ]);
  });

  it("re-running the seed SQL leaves counts unchanged (idempotent)", async () => {
    const beforePlans = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "plans"`,
    );
    const beforeRoles = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "role"`,
    );

    await pool.query(seedSql);

    const afterPlans = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "plans"`,
    );
    const afterRoles = await pool.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM "role"`,
    );

    expect(afterPlans.rows[0].c).toBe(beforePlans.rows[0].c);
    expect(afterRoles.rows[0].c).toBe(beforeRoles.rows[0].c);
  });
});
