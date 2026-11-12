-- Lot C.10 (approved 11.11.2026): the history of one record (a ClientDesk contact, a lead, a
-- deal) reads the organization's rows of one target, newest first. Without this index that read
-- scans every row of the organization. Additive: one index, no grant, no policy, no data change.

CREATE INDEX "audit_log_organization_id_target_idx"
  ON "audit"."audit_log" ("organization_id", "target_type", "target_id", "created_at" DESC);
