-- B3: store the user's active organization id in the session row.
-- Better Auth reads this via the additionalFields mapping in auth.ts.
ALTER TABLE "identity"."sessions"
  ADD COLUMN "active_organization_id" UUID;
