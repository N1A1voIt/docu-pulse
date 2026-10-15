-- 0004_invitations.sql — invitations table for email-first membership
CREATE TABLE IF NOT EXISTS "invitations" (
    "id_invitation"      BIGSERIAL NOT NULL,
    "id_organization"    BIGINT NOT NULL,
    "id_inviter_user"    BIGINT NOT NULL,
    "invited_email"      TEXT NOT NULL,
    "id_role"            BIGINT NOT NULL,
    "token_hash"         TEXT NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expires_at"         TIMESTAMPTZ NOT NULL,
    "revoked_at"         TIMESTAMPTZ,
    "accepted_at"        TIMESTAMPTZ,
    "accepted_user_id"   BIGINT,
    PRIMARY KEY ("id_invitation"),
    CONSTRAINT "invitations_unique_token_hash" UNIQUE ("token_hash"),
    CONSTRAINT "invitations_fk_organization" FOREIGN KEY ("id_organization")
        REFERENCES "organizations" ("id_organization") ON UPDATE NO ACTION ON DELETE NO ACTION,
    CONSTRAINT "invitations_fk_inviter" FOREIGN KEY ("id_inviter_user")
        REFERENCES "users" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
    CONSTRAINT "invitations_fk_role" FOREIGN KEY ("id_role")
        REFERENCES "role" ("id_role") ON UPDATE NO ACTION ON DELETE NO ACTION,
    CONSTRAINT "invitations_fk_accepted_user" FOREIGN KEY ("accepted_user_id")
        REFERENCES "users" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
CREATE INDEX IF NOT EXISTS "invitations_id_organization_idx" ON "invitations" ("id_organization");
CREATE INDEX IF NOT EXISTS "invitations_token_hash_idx" ON "invitations" ("token_hash");
CREATE INDEX IF NOT EXISTS "invitations_invited_email_idx" ON "invitations" ("invited_email");
