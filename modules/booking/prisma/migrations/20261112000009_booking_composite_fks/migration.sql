-- Lot B.FK — the same business on every link of Booking (asked by the founder on 12.11.2026; plan
-- reports/2026-11-12_plan-booking-b9.md, „B.FK”). Until now the links to client, service,
-- staff_member, resource (and the few others below) were simple FKs on (id): RLS and the triggers
-- kept the business, but the database itself did not refuse an id of another business. Now every
-- link inside booking is a composite FK (organization_id, <column>) → (organization_id, id), so a row
-- can only point to a row of its own business.
--
--   1. UNIQUE (organization_id, id) on the tables that did not have it yet (the target of the FKs);
--   2. every simple FK dropped and created again as a composite FK, with the same ON DELETE /
--      ON UPDATE (all RESTRICT) and a new name (<table>_<column>_org_fkey).
--
-- The new FKs are validated when they are created: if a row of the database points to another
-- business, the migration stops (nothing is changed) — the check query is in the report of the lot.
-- No column, table, role, grant, policy or function changes; the FKs to appointment, class_session,
-- appointment_series, waitlist_entry, package, package_sale, form_question that were already
-- composite stay as they are.

-- ── 1. the targets: UNIQUE (organization_id, id) ─────────────────────────────────────────────
CREATE UNIQUE INDEX "service_category_organization_id_id_key" ON "booking"."service_category" ("organization_id", "id");
ALTER TABLE "booking"."service_category"
  ADD CONSTRAINT "service_category_organization_id_id_key" UNIQUE USING INDEX "service_category_organization_id_id_key";
CREATE UNIQUE INDEX "service_organization_id_id_key" ON "booking"."service" ("organization_id", "id");
ALTER TABLE "booking"."service"
  ADD CONSTRAINT "service_organization_id_id_key" UNIQUE USING INDEX "service_organization_id_id_key";
CREATE UNIQUE INDEX "staff_member_organization_id_id_key" ON "booking"."staff_member" ("organization_id", "id");
ALTER TABLE "booking"."staff_member"
  ADD CONSTRAINT "staff_member_organization_id_id_key" UNIQUE USING INDEX "staff_member_organization_id_id_key";
CREATE UNIQUE INDEX "client_organization_id_id_key" ON "booking"."client" ("organization_id", "id");
ALTER TABLE "booking"."client"
  ADD CONSTRAINT "client_organization_id_id_key" UNIQUE USING INDEX "client_organization_id_id_key";
CREATE UNIQUE INDEX "resource_organization_id_id_key" ON "booking"."resource" ("organization_id", "id");
ALTER TABLE "booking"."resource"
  ADD CONSTRAINT "resource_organization_id_id_key" UNIQUE USING INDEX "resource_organization_id_id_key";
CREATE UNIQUE INDEX "medical_field_organization_id_id_key" ON "booking"."medical_field" ("organization_id", "id");
ALTER TABLE "booking"."medical_field"
  ADD CONSTRAINT "medical_field_organization_id_id_key" UNIQUE USING INDEX "medical_field_organization_id_id_key";
CREATE UNIQUE INDEX "appointment_payment_organization_id_id_key" ON "booking"."appointment_payment" ("organization_id", "id");
ALTER TABLE "booking"."appointment_payment"
  ADD CONSTRAINT "appointment_payment_organization_id_id_key" UNIQUE USING INDEX "appointment_payment_organization_id_id_key";

-- ── 2. the links: simple FKs → composite FKs ─────────────────────────────────────────────────

-- → appointment
ALTER TABLE "booking"."appointment_history" DROP CONSTRAINT "appointment_history_appointment_id_fkey";
ALTER TABLE "booking"."appointment_history"
  ADD CONSTRAINT "appointment_history_appointment_org_fkey" FOREIGN KEY ("organization_id", "appointment_id")
    REFERENCES "booking"."appointment" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."appointment_payment" DROP CONSTRAINT "appointment_payment_appointment_id_fkey";
ALTER TABLE "booking"."appointment_payment"
  ADD CONSTRAINT "appointment_payment_appointment_org_fkey" FOREIGN KEY ("organization_id", "appointment_id")
    REFERENCES "booking"."appointment" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."appointment_resource" DROP CONSTRAINT "appointment_resource_appointment_id_fkey";
ALTER TABLE "booking"."appointment_resource"
  ADD CONSTRAINT "appointment_resource_appointment_org_fkey" FOREIGN KEY ("organization_id", "appointment_id")
    REFERENCES "booking"."appointment" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- → appointment_payment
ALTER TABLE "booking"."appointment_payment" DROP CONSTRAINT "appointment_payment_refund_of_fkey";
ALTER TABLE "booking"."appointment_payment"
  ADD CONSTRAINT "appointment_payment_refund_of_payment_org_fkey" FOREIGN KEY ("organization_id", "refund_of_payment_id")
    REFERENCES "booking"."appointment_payment" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- → client
ALTER TABLE "booking"."appointment" DROP CONSTRAINT "appointment_client_id_fkey";
ALTER TABLE "booking"."appointment"
  ADD CONSTRAINT "appointment_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."appointment_payment" DROP CONSTRAINT "appointment_payment_client_id_fkey";
ALTER TABLE "booking"."appointment_payment"
  ADD CONSTRAINT "appointment_payment_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."appointment_series" DROP CONSTRAINT "appointment_series_client_id_fkey";
ALTER TABLE "booking"."appointment_series"
  ADD CONSTRAINT "appointment_series_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."client" DROP CONSTRAINT "client_merged_into_client_id_fkey";
ALTER TABLE "booking"."client"
  ADD CONSTRAINT "client_merged_into_client_org_fkey" FOREIGN KEY ("organization_id", "merged_into_client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."client_block" DROP CONSTRAINT "client_block_client_id_fkey";
ALTER TABLE "booking"."client_block"
  ADD CONSTRAINT "client_block_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."client_note_removal" DROP CONSTRAINT "client_note_removal_client_id_fkey";
ALTER TABLE "booking"."client_note_removal"
  ADD CONSTRAINT "client_note_removal_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."medical_answer" DROP CONSTRAINT "medical_answer_client_id_fkey";
ALTER TABLE "booking"."medical_answer"
  ADD CONSTRAINT "medical_answer_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."medical_consent" DROP CONSTRAINT "medical_consent_client_id_fkey";
ALTER TABLE "booking"."medical_consent"
  ADD CONSTRAINT "medical_consent_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."package_sale" DROP CONSTRAINT "package_sale_client_id_fkey";
ALTER TABLE "booking"."package_sale"
  ADD CONSTRAINT "package_sale_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."waitlist_entry" DROP CONSTRAINT "waitlist_entry_client_id_fkey";
ALTER TABLE "booking"."waitlist_entry"
  ADD CONSTRAINT "waitlist_entry_client_org_fkey" FOREIGN KEY ("organization_id", "client_id")
    REFERENCES "booking"."client" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- → medical_field
ALTER TABLE "booking"."medical_answer" DROP CONSTRAINT "medical_answer_field_id_fkey";
ALTER TABLE "booking"."medical_answer"
  ADD CONSTRAINT "medical_answer_field_org_fkey" FOREIGN KEY ("organization_id", "field_id")
    REFERENCES "booking"."medical_field" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- → resource
ALTER TABLE "booking"."appointment_resource" DROP CONSTRAINT "appointment_resource_resource_id_fkey";
ALTER TABLE "booking"."appointment_resource"
  ADD CONSTRAINT "appointment_resource_resource_org_fkey" FOREIGN KEY ("organization_id", "resource_id")
    REFERENCES "booking"."resource" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."class_session" DROP CONSTRAINT "class_session_resource_id_fkey";
ALTER TABLE "booking"."class_session"
  ADD CONSTRAINT "class_session_resource_org_fkey" FOREIGN KEY ("organization_id", "resource_id")
    REFERENCES "booking"."resource" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."service_resource" DROP CONSTRAINT "service_resource_resource_id_fkey";
ALTER TABLE "booking"."service_resource"
  ADD CONSTRAINT "service_resource_resource_org_fkey" FOREIGN KEY ("organization_id", "resource_id")
    REFERENCES "booking"."resource" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- → service
ALTER TABLE "booking"."appointment" DROP CONSTRAINT "appointment_service_id_fkey";
ALTER TABLE "booking"."appointment"
  ADD CONSTRAINT "appointment_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."appointment_series" DROP CONSTRAINT "appointment_series_service_id_fkey";
ALTER TABLE "booking"."appointment_series"
  ADD CONSTRAINT "appointment_series_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."class_session" DROP CONSTRAINT "class_session_service_id_fkey";
ALTER TABLE "booking"."class_session"
  ADD CONSTRAINT "class_session_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."package" DROP CONSTRAINT "package_service_id_fkey";
ALTER TABLE "booking"."package"
  ADD CONSTRAINT "package_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."package_sale" DROP CONSTRAINT "package_sale_service_id_fkey";
ALTER TABLE "booking"."package_sale"
  ADD CONSTRAINT "package_sale_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."public_hold" DROP CONSTRAINT "public_hold_service_id_fkey";
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."service_resource" DROP CONSTRAINT "service_resource_service_id_fkey";
ALTER TABLE "booking"."service_resource"
  ADD CONSTRAINT "service_resource_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."staff_service" DROP CONSTRAINT "staff_service_service_id_fkey";
ALTER TABLE "booking"."staff_service"
  ADD CONSTRAINT "staff_service_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."staff_service_terms" DROP CONSTRAINT "staff_service_terms_service_id_fkey";
ALTER TABLE "booking"."staff_service_terms"
  ADD CONSTRAINT "staff_service_terms_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."waitlist_entry" DROP CONSTRAINT "waitlist_entry_service_id_fkey";
ALTER TABLE "booking"."waitlist_entry"
  ADD CONSTRAINT "waitlist_entry_service_org_fkey" FOREIGN KEY ("organization_id", "service_id")
    REFERENCES "booking"."service" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- → service_category
ALTER TABLE "booking"."service" DROP CONSTRAINT "service_category_id_fkey";
ALTER TABLE "booking"."service"
  ADD CONSTRAINT "service_category_org_fkey" FOREIGN KEY ("organization_id", "category_id")
    REFERENCES "booking"."service_category" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- → staff_member
ALTER TABLE "booking"."appointment" DROP CONSTRAINT "appointment_staff_member_id_fkey";
ALTER TABLE "booking"."appointment"
  ADD CONSTRAINT "appointment_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."appointment_series" DROP CONSTRAINT "appointment_series_staff_member_id_fkey";
ALTER TABLE "booking"."appointment_series"
  ADD CONSTRAINT "appointment_series_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."class_session" DROP CONSTRAINT "class_session_staff_member_id_fkey";
ALTER TABLE "booking"."class_session"
  ADD CONSTRAINT "class_session_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."public_hold" DROP CONSTRAINT "public_hold_staff_member_id_fkey";
ALTER TABLE "booking"."public_hold"
  ADD CONSTRAINT "public_hold_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."staff_day_override" DROP CONSTRAINT "staff_day_override_staff_member_id_fkey";
ALTER TABLE "booking"."staff_day_override"
  ADD CONSTRAINT "staff_day_override_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."staff_service" DROP CONSTRAINT "staff_service_staff_member_id_fkey";
ALTER TABLE "booking"."staff_service"
  ADD CONSTRAINT "staff_service_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."staff_service_terms" DROP CONSTRAINT "staff_service_terms_staff_member_id_fkey";
ALTER TABLE "booking"."staff_service_terms"
  ADD CONSTRAINT "staff_service_terms_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."staff_time_off" DROP CONSTRAINT "staff_time_off_staff_member_id_fkey";
ALTER TABLE "booking"."staff_time_off"
  ADD CONSTRAINT "staff_time_off_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."staff_weekly_hours" DROP CONSTRAINT "staff_weekly_hours_staff_member_id_fkey";
ALTER TABLE "booking"."staff_weekly_hours"
  ADD CONSTRAINT "staff_weekly_hours_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."time_block" DROP CONSTRAINT "time_block_staff_member_id_fkey";
ALTER TABLE "booking"."time_block"
  ADD CONSTRAINT "time_block_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."waitlist_entry" DROP CONSTRAINT "waitlist_entry_staff_member_id_fkey";
ALTER TABLE "booking"."waitlist_entry"
  ADD CONSTRAINT "waitlist_entry_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking"."waitlist_offer" DROP CONSTRAINT "waitlist_offer_staff_member_id_fkey";
ALTER TABLE "booking"."waitlist_offer"
  ADD CONSTRAINT "waitlist_offer_staff_member_org_fkey" FOREIGN KEY ("organization_id", "staff_member_id")
    REFERENCES "booking"."staff_member" ("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
