-- Lot CR.4 (plans/CRM.md §3; design S130 ClientDeskSegments, S132 ClientDeskSettings · „Etichete și
-- surse”): the tags and the segments of ClientDesk.
--
--   tag         → a tag of the business (name, colour key); rename, „Unește cu…” and „Șterge” in the
--                 settings (S132). „Șterge” takes it off every contact and keeps the row as deleted
--                 (no physical delete, §6.4 c).
--   contact.tag_ids → the tags of a contact, an array of tag ids (no link table, so no DELETE is
--                 needed to untag); GIN index for the filter.
--   segment     → a saved list: the rules (the criteria of S130: source, tag, owner, date added,
--                 company, birthday now; client state, last visit and marketing consent come with
--                 CR.12 / CR.14), all / any, who sees it („Doar eu” / „Toată echipa”, S130 default:
--                 the team), and the predefined segment „N-au mai venit de N zile” (kind lapsed).
--   settings    → inactive_after_months (CR.1) is replaced by lapsed_segment_days, the days of the
--                 predefined segment (S130: 60 by default, 7–365). CR.1 is not on staging yet.

-- CreateTable
CREATE TABLE "crm"."tag" (
  "id"                 UUID        NOT NULL,
  "organization_id"    UUID        NOT NULL,
  "name"               VARCHAR(40) NOT NULL,
  -- a colour key of the design tokens (neutral, peach, lime, …), never a colour value
  "color"              VARCHAR(16) NOT NULL DEFAULT 'neutral',
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_by_user_id" UUID        NOT NULL,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "tag_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tag_name_check" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 40),
  CONSTRAINT "tag_color_check" CHECK ("color" ~ '^[a-z]{3,16}$'),
  CONSTRAINT "tag_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);

CREATE UNIQUE INDEX "tag_active_name_key"
  ON "crm"."tag" ("organization_id", lower("name"))
  WHERE "deleted_at" IS NULL;

CREATE TRIGGER tag_touch
  BEFORE UPDATE ON "crm"."tag"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

ALTER TABLE "crm"."contact"
  ADD COLUMN "tag_ids" UUID[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT "contact_tag_ids_check" CHECK (cardinality("tag_ids") <= 50);
CREATE INDEX "contact_tag_ids_idx" ON "crm"."contact" USING GIN ("tag_ids");

-- CreateTable
CREATE TABLE "crm"."segment" (
  "id"                 UUID        NOT NULL,
  "organization_id"    UUID        NOT NULL,
  "name"               VARCHAR(80) NOT NULL,
  -- the rules, validated by the contract: [{ "field": …, "op": …, "value": … }]
  "rules"              JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- all | any
  "match"              VARCHAR(3)  NOT NULL DEFAULT 'all',
  -- me („Doar eu”) | team („Toată echipa”, S130 default)
  "visibility"         VARCHAR(4)  NOT NULL DEFAULT 'team',
  -- custom | lapsed (the predefined „N-au mai venit de N zile”, one per business)
  "kind"               VARCHAR(6)  NOT NULL DEFAULT 'custom',
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  -- NULL for the predefined segment (created by ClientDesk)
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "segment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "segment_name_check" CHECK ("name" = btrim("name") AND char_length("name") BETWEEN 1 AND 80),
  CONSTRAINT "segment_rules_check"
    CHECK (jsonb_typeof("rules") = 'array' AND jsonb_array_length("rules") <= 20),
  CONSTRAINT "segment_match_check" CHECK ("match" IN ('all', 'any')),
  CONSTRAINT "segment_visibility_check" CHECK ("visibility" IN ('me', 'team')),
  CONSTRAINT "segment_kind_check" CHECK ("kind" IN ('custom', 'lapsed')),
  -- the predefined segment is the team's, created by ClientDesk, never deleted
  CONSTRAINT "segment_lapsed_check" CHECK (
    "kind" = 'custom'
    OR ("visibility" = 'team' AND "created_by_user_id" IS NULL AND "deleted_at" IS NULL)
  ),
  -- a „Doar eu” segment has its author
  CONSTRAINT "segment_me_check" CHECK ("visibility" = 'team' OR "created_by_user_id" IS NOT NULL),
  CONSTRAINT "segment_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);

CREATE INDEX "segment_organization_id_idx" ON "crm"."segment" ("organization_id");
-- one predefined segment per business
CREATE UNIQUE INDEX "segment_lapsed_key" ON "crm"."segment" ("organization_id") WHERE "kind" = 'lapsed';

CREATE TRIGGER segment_touch
  BEFORE UPDATE ON "crm"."segment"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- settings: the days of the predefined segment replace the months of CR.1
ALTER TABLE "crm"."settings"
  DROP COLUMN "inactive_after_months",
  ADD COLUMN "lapsed_segment_days" SMALLINT NOT NULL DEFAULT 60,
  ADD CONSTRAINT "settings_lapsed_segment_days_check" CHECK ("lapsed_segment_days" BETWEEN 7 AND 365);

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."tag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."segment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_tag ON "crm"."tag"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY crm_rw_segment ON "crm"."segment"
  TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: only crm_rw; explicit per table and per column; no DELETE (§6.4 c); no UPDATE of id /
-- organization_id / created_* / kind.
REVOKE ALL ON "crm"."tag", "crm"."segment" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."tag", "crm"."segment" TO crm_rw;
GRANT UPDATE ("name", "color", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."tag" TO crm_rw;
GRANT UPDATE ("name", "rules", "match", "visibility", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."segment" TO crm_rw;
GRANT UPDATE ("tag_ids") ON "crm"."contact" TO crm_rw;
GRANT UPDATE ("lapsed_segment_days") ON "crm"."settings" TO crm_rw;
