import { describe, it, expect, beforeAll } from "vitest";
import { pool, resetSchema } from "./helpers/db.js";

const EXPECTED_TABLES = [
  "plans",
  "role",
  "users",
  "organizations",
  "seats",
  "possible_integration_docu",
  "integrations",
];

describe("schema structure", () => {
  beforeAll(async () => {
    await resetSchema();
  });

  it("creates exactly the 7 base tables", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    expect(rows.map((r: { table_name: string }) => r.table_name).sort()).toEqual(
      [...EXPECTED_TABLES].sort(),
    );
  });

  it("does not have id_organization on users", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'`,
    );
    const cols = rows.map((r: { column_name: string }) => r.column_name);
    expect(cols).not.toContain("id_organization");
  });

  it("has id_organization on organizations", async () => {
    const { rows } = await pool.query<{ column_name: string }>(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'organizations'`,
    );
    expect(rows.map((r: { column_name: string }) => r.column_name)).toContain("id_organization");
  });

  it("organizations.slug is VARCHAR(16)", async () => {
    const { rows } = await pool.query<{
      data_type: string;
      character_maximum_length: number;
    }>(
      `SELECT data_type, character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'organizations'
          AND column_name = 'slug'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe("character varying");
    expect(rows[0].character_maximum_length).toBe(16);
  });

  it("has no column-or-table named with the legacy typo", async () => {
    const { rows } = await pool.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public'
       UNION ALL
       SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public'`,
    );
    const typo = "id_organnization";
    const hits = rows.filter((r: { name: string }) => r.name === typo);
    expect(hits).toHaveLength(0);
  });
});
