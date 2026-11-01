-- Lot 4.4 — preferințele pe rândurile din „Contul tău · Notificări” (S114b, D4-6)
--
-- Designul alege e-mailul pe subiecte („Programări noi și modificări”, „Facturi și plăți”,
-- „Limitele abonamentului”…), nu doar pe categoria operational / commercial. Preferința se ține
-- acum pe persoană, subiect și canal; categoria rămâne pe rând (operational / commercial).
-- Subiectele de securitate nu se salvează: nu se pot opri (S83), contractul le refuză.
--
-- Aditivă pentru date: rândurile existente primesc subiectul categoriei lor
-- („operational”, „recommendations” pentru commercial).

ALTER TABLE "notifications"."notification_preference" ADD COLUMN "topic" VARCHAR(32);

UPDATE "notifications"."notification_preference"
   SET "topic" = CASE "category" WHEN 'commercial' THEN 'recommendations' ELSE "category" END;

ALTER TABLE "notifications"."notification_preference" ALTER COLUMN "topic" SET NOT NULL;

ALTER TABLE "notifications"."notification_preference"
  DROP CONSTRAINT "notification_preference_pkey";
ALTER TABLE "notifications"."notification_preference"
  ADD CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("user_id", "topic", "channel");

ALTER TABLE "notifications"."notification_preference"
  ADD CONSTRAINT "notification_preference_topic_check"
  CHECK ("topic" ~ '^[a-z][a-zA-Z]{1,31}$');
