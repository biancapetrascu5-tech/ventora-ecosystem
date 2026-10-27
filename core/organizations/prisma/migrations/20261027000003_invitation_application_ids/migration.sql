-- AddColumn: application_ids on invitation
-- Stores the list of applicationIds to grant access to upon accepting the invitation.
-- Defaults to empty array; populated by inviteMember when applicationIds are specified.
ALTER TABLE "organizations"."invitation"
  ADD COLUMN "application_ids" VARCHAR(64)[] NOT NULL DEFAULT '{}';
