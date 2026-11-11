-- Lot CR.9 (plans/CRM.md §3; D-CRM-13; design S131 ClientDeskDeals): the pipelines, their stages,
-- the loss reasons and the deals.
--
--   pipeline          → at most what the plan allows (stock quota crm.pipelines; S131: 2), one is
--                       the default. The default one ClientDesk creates is named by its key
--                       (translated on screen); a business's own has a name.
--   stage             → the open stages of a pipeline, in order, each with its default probability
--                       (glossary: Contact nou 10, Ofertă trimisă 30, Negociere 60); won and lost
--                       are the deal's status, not stages.
--   loss_reason       → the business's list (S131 defaults by key: price, competitor, no reply,
--                       postponed, no budget, other), editable; required when a deal is lost.
--   deal              → contact and / or company, the items (EasyBook services with CR.12; free
--                       items with a price now), the value = their sum, currency RON / EUR, the
--                       probability, the expected close date, the owner, the stage and when it last
--                       moved (stuck for N days), open → won / lost (final value, date, reason,
--                       note), the lead it came from, the bin.
--   deal_stage_change → the history of the moves (INSERT + SELECT only).

-- CreateTable
CREATE TABLE "crm"."pipeline" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "key"                VARCHAR(12),
  "name"               VARCHAR(60),
  "is_default"         BOOLEAN      NOT NULL DEFAULT false,
  "sort_order"         INTEGER      NOT NULL DEFAULT 0,
  "quota_operation_id" VARCHAR(80),
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pipeline_name_check" CHECK (
    ("key" IS NOT NULL OR char_length(btrim("name")) >= 1) AND ("key" IS NULL OR "key" = 'sales')
  ),
  CONSTRAINT "pipeline_default_check" CHECK (NOT "is_default" OR "deleted_at" IS NULL),
  CONSTRAINT "pipeline_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);
CREATE INDEX "pipeline_organization_id_idx" ON "crm"."pipeline" ("organization_id");
-- one default pipeline per business
CREATE UNIQUE INDEX "pipeline_default_key" ON "crm"."pipeline" ("organization_id") WHERE "is_default";
-- the reconciliation resolver looks a reservation up by its operation
CREATE UNIQUE INDEX "pipeline_quota_operation_id_key" ON "crm"."pipeline" ("quota_operation_id")
  WHERE "quota_operation_id" IS NOT NULL;

CREATE TABLE "crm"."stage" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "pipeline_id"        UUID         NOT NULL,
  "key"                VARCHAR(16),
  "name"               VARCHAR(40),
  "sort_order"         INTEGER      NOT NULL DEFAULT 0,
  "probability"        INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "stage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stage_name_check" CHECK (
    ("key" IS NOT NULL OR char_length(btrim("name")) >= 1)
    AND ("key" IS NULL OR "key" IN ('new_contact', 'proposal_sent', 'negotiation'))
  ),
  CONSTRAINT "stage_probability_check" CHECK ("probability" BETWEEN 0 AND 100),
  CONSTRAINT "stage_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL)),
  CONSTRAINT "stage_pipeline_id_fkey" FOREIGN KEY ("pipeline_id")
    REFERENCES "crm"."pipeline" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "stage_pipeline_id_idx" ON "crm"."stage" ("pipeline_id", "sort_order");

CREATE TABLE "crm"."loss_reason" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "key"                VARCHAR(12),
  "label"              VARCHAR(80),
  "sort_order"         INTEGER      NOT NULL DEFAULT 0,
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "loss_reason_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "loss_reason_label_check" CHECK (
    ("key" IS NOT NULL OR char_length(btrim("label")) >= 1)
    AND ("key" IS NULL OR "key" IN ('price', 'competitor', 'no_reply', 'postponed', 'no_budget', 'other'))
  ),
  CONSTRAINT "loss_reason_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL))
);
CREATE INDEX "loss_reason_organization_id_idx" ON "crm"."loss_reason" ("organization_id");
-- the defaults are written once per business (ON CONFLICT)
CREATE UNIQUE INDEX "loss_reason_key_key" ON "crm"."loss_reason" ("organization_id", "key") WHERE "key" IS NOT NULL;

CREATE TABLE "crm"."deal" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "pipeline_id"        UUID         NOT NULL,
  "stage_id"           UUID         NOT NULL,
  "title"              VARCHAR(160) NOT NULL,
  "contact_id"         UUID,
  "company_id"         UUID,
  "lead_id"            UUID,
  "currency"           VARCHAR(3)   NOT NULL DEFAULT 'RON',
  "items"              JSONB        NOT NULL DEFAULT '[]',
  "value_minor"        BIGINT       NOT NULL DEFAULT 0,
  "probability"        INTEGER      NOT NULL DEFAULT 0,
  "expected_close_on"  DATE,
  "owner_user_id"      UUID,
  "status"             VARCHAR(4)   NOT NULL DEFAULT 'open',
  "stage_changed_at"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "won_value_minor"    BIGINT,
  "closed_on"          DATE,
  "close_note"         VARCHAR(500),
  "loss_reason_id"     UUID,
  "closed_at"          TIMESTAMPTZ,
  "closed_by_user_id"  UUID,
  "deleted_at"         TIMESTAMPTZ,
  "deleted_by_user_id" UUID,
  "created_by_user_id" UUID         NOT NULL,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "deal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_title_check" CHECK (char_length(btrim("title")) >= 1),
  -- a contact and / or a company
  CONSTRAINT "deal_party_check" CHECK ("contact_id" IS NOT NULL OR "company_id" IS NOT NULL),
  CONSTRAINT "deal_currency_check" CHECK ("currency" IN ('RON', 'EUR')),
  CONSTRAINT "deal_items_check" CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") <= 50),
  CONSTRAINT "deal_value_check" CHECK ("value_minor" >= 0 AND ("won_value_minor" IS NULL OR "won_value_minor" >= 0)),
  CONSTRAINT "deal_probability_check" CHECK ("probability" BETWEEN 0 AND 100),
  CONSTRAINT "deal_status_check" CHECK (
    ("status" = 'open' AND "closed_at" IS NULL AND "closed_by_user_id" IS NULL AND "closed_on" IS NULL
       AND "won_value_minor" IS NULL AND "loss_reason_id" IS NULL AND "close_note" IS NULL)
    OR ("status" = 'won' AND "closed_at" IS NOT NULL AND "closed_by_user_id" IS NOT NULL
       AND "closed_on" IS NOT NULL AND "won_value_minor" IS NOT NULL AND "loss_reason_id" IS NULL)
    OR ("status" = 'lost' AND "closed_at" IS NOT NULL AND "closed_by_user_id" IS NOT NULL
       AND "closed_on" IS NOT NULL AND "won_value_minor" IS NULL AND "loss_reason_id" IS NOT NULL)
  ),
  CONSTRAINT "deal_deleted_check" CHECK (("deleted_at" IS NULL) = ("deleted_by_user_id" IS NULL)),
  CONSTRAINT "deal_pipeline_id_fkey" FOREIGN KEY ("pipeline_id")
    REFERENCES "crm"."pipeline" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "deal_stage_id_fkey" FOREIGN KEY ("stage_id")
    REFERENCES "crm"."stage" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "deal_contact_id_fkey" FOREIGN KEY ("contact_id")
    REFERENCES "crm"."contact" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "deal_company_id_fkey" FOREIGN KEY ("company_id")
    REFERENCES "crm"."company" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "deal_lead_id_fkey" FOREIGN KEY ("lead_id")
    REFERENCES "crm"."lead" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "deal_loss_reason_id_fkey" FOREIGN KEY ("loss_reason_id")
    REFERENCES "crm"."loss_reason" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
-- the board: a pipeline's deals by stage
CREATE INDEX "deal_pipeline_idx" ON "crm"."deal" ("organization_id", "pipeline_id", "status", "stage_id");
CREATE INDEX "deal_contact_id_idx" ON "crm"."deal" ("contact_id");
CREATE INDEX "deal_company_id_idx" ON "crm"."deal" ("company_id");
CREATE INDEX "deal_owner_idx" ON "crm"."deal" ("organization_id", "owner_user_id");

CREATE TABLE "crm"."deal_stage_change" (
  "id"                 UUID         NOT NULL,
  "organization_id"    UUID         NOT NULL,
  "deal_id"            UUID         NOT NULL,
  "from_stage_id"      UUID,
  "to_stage_id"        UUID         NOT NULL,
  "changed_by_user_id" UUID         NOT NULL,
  "changed_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "deal_stage_change_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deal_stage_change_deal_id_fkey" FOREIGN KEY ("deal_id")
    REFERENCES "crm"."deal" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "deal_stage_change_deal_id_idx" ON "crm"."deal_stage_change" ("deal_id", "changed_at");

CREATE TRIGGER pipeline_touch BEFORE UPDATE ON "crm"."pipeline"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();
CREATE TRIGGER stage_touch BEFORE UPDATE ON "crm"."stage"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();
CREATE TRIGGER loss_reason_touch BEFORE UPDATE ON "crm"."loss_reason"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();
CREATE TRIGGER deal_touch BEFORE UPDATE ON "crm"."deal"
  FOR EACH ROW EXECUTE FUNCTION crm.touch_updated_at();

-- RLS (D-SEC-1): USING + WITH CHECK on app.organization_id
ALTER TABLE "crm"."pipeline" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."stage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."loss_reason" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."deal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm"."deal_stage_change" ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_rw_pipeline ON "crm"."pipeline" TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY crm_rw_stage ON "crm"."stage" TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY crm_rw_loss_reason ON "crm"."loss_reason" TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY crm_rw_deal ON "crm"."deal" TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
CREATE POLICY crm_rw_deal_stage_change ON "crm"."deal_stage_change" TO crm_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

-- Grants: only crm_rw; no DELETE (§6.4 c); no UPDATE of id / organization_id / created_*.
REVOKE ALL ON "crm"."pipeline", "crm"."stage", "crm"."loss_reason", "crm"."deal",
  "crm"."deal_stage_change" FROM PUBLIC;
GRANT SELECT, INSERT ON "crm"."pipeline", "crm"."stage", "crm"."loss_reason", "crm"."deal",
  "crm"."deal_stage_change" TO crm_rw;
GRANT UPDATE ("name", "is_default", "sort_order", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."pipeline" TO crm_rw;
GRANT UPDATE ("name", "sort_order", "probability", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."stage" TO crm_rw;
GRANT UPDATE ("label", "sort_order", "deleted_at", "deleted_by_user_id", "updated_at")
  ON "crm"."loss_reason" TO crm_rw;
GRANT UPDATE (
  "stage_id", "title", "contact_id", "company_id", "currency", "items", "value_minor", "probability",
  "expected_close_on", "owner_user_id", "status", "stage_changed_at", "won_value_minor", "closed_on",
  "close_note", "loss_reason_id", "closed_at", "closed_by_user_id", "deleted_at", "deleted_by_user_id",
  "updated_at"
) ON "crm"."deal" TO crm_rw;
-- deal_stage_change: a log, no UPDATE
