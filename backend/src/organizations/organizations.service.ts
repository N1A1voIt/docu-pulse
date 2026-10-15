import { pool } from "../db/pool.js";
import type { PoolClient } from "pg";
import { slugify } from "./slug.js";
import type { Organization, OrganizationForUser, CreateTeamOrgInput } from "./types.js";

export async function createPersonalOrganization(
  userId: string,
  displayName?: string | null,
): Promise<Organization> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const planId = await getPlanIdFromClient(client, "Free");
    const name = displayName
      ? `${displayName}'s personal space`
      : "Personal space";
    const slug = slugify(name);
    const orgRes = await client.query<{ id_organization: string; slug: string; is_personal: boolean; id_plan: string }>(
      `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
       VALUES ($1,$2,true,$3,$4) RETURNING "id_organization","slug","is_personal","id_plan"`,
      [name, slug, userId, planId],
    );
    const org = orgRes.rows[0];
    const roleId = await getRoleIdFromClient(client, "owner");
    await client.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role","role_txt") VALUES ($1,$2,$3,'owner')`,
      [userId, org.id_organization, roleId],
    );
    await client.query("COMMIT");
    return {
      id: org.id_organization,
      name,
      slug: org.slug,
      isPersonal: org.is_personal,
      planId: org.id_plan,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function createTeamOrganization(
  ownerUserId: string,
  input: CreateTeamOrgInput,
): Promise<Organization> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const planId = await getPlanIdFromClient(client, "Org");
    const slug = input.slug ?? slugify(input.name);
    const orgRes = await client.query<{ id_organization: string; slug: string; is_personal: boolean; id_plan: string }>(
      `INSERT INTO "organizations" ("organization_name","slug","is_personal","id_user","id_plan")
       VALUES ($1,$2,false,$3,$4) RETURNING "id_organization","slug","is_personal","id_plan"`,
      [input.name, slug, ownerUserId, planId],
    );
    const org = orgRes.rows[0];
    const roleId = await getRoleIdFromClient(client, "owner");
    await client.query(
      `INSERT INTO "seats" ("id_user","id_organization","id_role","role_txt") VALUES ($1,$2,$3,'owner')`,
      [ownerUserId, org.id_organization, roleId],
    );
    await client.query("COMMIT");
    return {
      id: org.id_organization,
      name: input.name,
      slug: org.slug,
      isPersonal: org.is_personal,
      planId: org.id_plan,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const res = await pool.query<{ id_organization: string; organization_name: string; slug: string; is_personal: boolean; id_plan: string }>(
    `SELECT "id_organization","organization_name","slug","is_personal","id_plan"
       FROM "organizations" WHERE "id_organization" = $1`,
    [orgId],
  );
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id_organization,
    name: r.organization_name,
    slug: r.slug,
    isPersonal: r.is_personal,
    planId: r.id_plan,
  };
}

export async function getMemberRole(orgId: string, userId: string): Promise<string | null> {
  const res = await pool.query<{ slug: string }>(
    `SELECT r."slug"
       FROM "seats" s JOIN "role" r ON r."id_role" = s."id_role"
      WHERE s."id_organization" = $1 AND s."id_user" = $2`,
    [orgId, userId],
  );
  return res.rows[0]?.slug ?? null;
}

export async function listOrganizationsForUser(userId: string): Promise<OrganizationForUser[]> {
  const res = await pool.query<{
    id_organization: string;
    organization_name: string;
    slug: string;
    is_personal: boolean;
    id_plan: string;
    plan_name: string | null;
    role_slug: string | null;
  }>(
    `SELECT o."id_organization", o."organization_name", o."slug", o."is_personal", o."id_plan",
            p."plan_name" AS plan_name,
            r."slug" AS role_slug
       FROM "organizations" o
       JOIN "seats" s ON s."id_organization" = o."id_organization"
       LEFT JOIN "plans" p ON p."id" = o."id_plan"
       LEFT JOIN "role" r ON r."id_role" = s."id_role"
      WHERE s."id_user" = $1
      ORDER BY o."id_organization"`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: r.id_organization,
    name: r.organization_name,
    slug: r.slug,
    isPersonal: r.is_personal,
    planId: r.id_plan,
    planName: r.plan_name,
    role: r.role_slug,
  }));
}

// helpers
async function getPlanIdFromClient(client: PoolClient, name: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    `SELECT "id"::text AS id FROM "plans" WHERE "plan_name" = $1`,
    [name],
  );
  if (res.rows.length === 0) throw new Error(`Unknown plan: ${name}`);
  return res.rows[0].id;
}

async function getRoleIdFromClient(client: PoolClient, slug: string): Promise<string> {
  const res = await client.query<{ id_role: string }>(
    `SELECT "id_role" FROM "role" WHERE "slug" = $1`,
    [slug],
  );
  if (res.rows.length === 0) throw new Error(`Unknown role: ${slug}`);
  return res.rows[0].id_role;
}

// avoid unused
