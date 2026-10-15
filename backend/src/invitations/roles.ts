import { pool } from "../db/pool.js";

export async function getRoleIdBySlug(slug: string): Promise<string> {
  const res = await pool.query<{ id_role: string }>(
    `SELECT "id_role" FROM "role" WHERE "slug" = $1`,
    [slug],
  );
  if (res.rows.length === 0) throw new Error(`Unknown role: ${slug}`);
  return res.rows[0].id_role;
}

export function normalizeRoleSlug(role: string): string {
  return String(role).trim().toLowerCase();
}

export const VALID_ROLES = ["owner", "admin", "member"] as const;

export function isValidRole(role: string): role is (typeof VALID_ROLES)[number] {
  return (VALID_ROLES as readonly string[]).includes(normalizeRoleSlug(role));
}