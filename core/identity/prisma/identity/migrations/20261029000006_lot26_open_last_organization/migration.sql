-- Lot 2.6 · F: preferința „Deschide direct ultima afacere data viitoare”, salvată pe utilizator.
-- Aditivă: o coloană nouă cu valoare implicită; rândurile existente primesc false.
ALTER TABLE "identity"."users" ADD COLUMN "open_last_organization" BOOLEAN NOT NULL DEFAULT false;
