-- Lot B.14b — the texts of the client e-mails, edited by the business (design BookingMessageTemplates
-- S127, Setări · Mesaje). Decisions of the founder (13.11): the business changes the subject and the
-- text; the appointment block, the policy line, the button and the footer stay fixed. A text per
-- language: a client whose language has no text of the business gets the Ventora text.
--
-- message_template  one row per business, message and language. subject / body NULL = the Ventora
--                   text („Revino la textul inițial” sets them back to NULL: no DELETE, as everywhere
--                   in booking). The variables ({client}, {service}, {date}, {time}, {member},
--                   {business}, {link}) are checked by the module; the length here.

CREATE TABLE "booking"."message_template" (
    "organization_id"    UUID         NOT NULL,
    "kind"               VARCHAR(20)  NOT NULL,
    "locale"             VARCHAR(5)   NOT NULL,
    "subject"            VARCHAR(150),
    "body"               TEXT,
    "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_by_user_id" UUID,

    CONSTRAINT "message_template_pkey" PRIMARY KEY ("organization_id", "kind", "locale"),
    CONSTRAINT "message_template_kind_check"
      CHECK ("kind" IN ('confirmation', 'reminder', 'change', 'cancellation', 'thanks')),
    CONSTRAINT "message_template_locale_check"
      CHECK ("locale" IN ('ro', 'en', 'fr', 'es', 'de', 'it')),
    -- both or neither: a saved text has a subject and a body
    CONSTRAINT "message_template_text_check" CHECK (
      ("subject" IS NULL AND "body" IS NULL)
      OR ("subject" = btrim("subject") AND char_length("subject") BETWEEN 1 AND 150
          AND char_length(btrim("body")) BETWEEN 1 AND 2000)
    )
);

CREATE TRIGGER message_template_touch
  BEFORE UPDATE ON "booking"."message_template"
  FOR EACH ROW EXECUTE FUNCTION booking.touch_updated_at();

ALTER TABLE "booking"."message_template" ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_rw_message_template ON "booking"."message_template"
  FOR ALL TO booking_rw
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

REVOKE ALL ON "booking"."message_template" FROM PUBLIC;
GRANT SELECT, INSERT ON "booking"."message_template" TO booking_rw;
GRANT UPDATE ("subject", "body", "updated_at", "updated_by_user_id")
  ON "booking"."message_template" TO booking_rw;
