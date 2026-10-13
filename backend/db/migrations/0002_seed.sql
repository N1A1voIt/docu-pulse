-- 0002_seed.sql — idempotent seeds: plans + roles
-- Spec: docs/SPEC-schema.md · Plan: docs/plans/plan.md (Task 4)
-- Seeds fixed: plans = Free ($0), Org ($20/seat); roles = owner, admin, member.

-- plans.plan_name has no UNIQUE constraint, so guard with WHERE NOT EXISTS.
INSERT INTO "plans" ("plan_name", "price_per_seat")
SELECT 'Free', 0
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "plan_name" = 'Free');

INSERT INTO "plans" ("plan_name", "price_per_seat")
SELECT 'Org', 20
WHERE NOT EXISTS (SELECT 1 FROM "plans" WHERE "plan_name" = 'Org');

-- role.role is UNIQUE → ON CONFLICT works.
INSERT INTO "role" ("role", "slug") VALUES
    ('owner',  'owner'),
    ('admin',  'admin'),
    ('member', 'member')
ON CONFLICT ("role") DO NOTHING;
