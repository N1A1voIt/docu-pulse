import { pool } from "../db/pool.js";

export async function canInvite(orgId: string): Promise<boolean> {
  const res = await pool.query<{ is_personal: boolean | null; plan_name: string | null }>(
    `SELECT o."is_personal", p."plan_name"
       FROM "organizations" o
       LEFT JOIN "plans" p ON p."id" = o."id_plan"
      WHERE o."id_organization" = $1`,
    [orgId],
  );
  if (res.rows.length === 0) return false;
  const row = res.rows[0];
  if (row.is_personal) return false;
  if (row.plan_name !== "Org") return false;
  return true;
}

export const Entitlements = { canInvite };
export default Entitlements;