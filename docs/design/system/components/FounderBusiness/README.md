# FounderBusiness

One business: usage against limits (exceptions included, with the estimated date the limit is reached), per-business exceptions (value, until, reason, who added it), plan, owner, recent changes. Main action "Adaugă o excepție". Suspending asks for confirmation.

**Plăți și facturi (S111).** The tab with the subscription, the purchase history, refunds and confirming bank transfers is drawn in FounderBusinessBilling. The Spine has "Cereri" (FounderRequests).

**On the phone, suspended, reactivated (S112).** Under 768px the header keeps the same pair as on desktop — the main action and "Mai multe acțiuni" — under the title; the menu holds support session, owner recovery, move to another version, resend the owner's invitation and suspend. A suspended business shows "Suspendată" (neutral, lock), a note under the header ("Suspendată pe {data} de {nume}. Membrii nu se pot conecta până reactivezi afacerea.") and "Reactivează afacerea" as the main action, confirmed by a dialog that says what happens. Drawn in FounderBusinessActions; keys in `i18n/founder-business.json` (RO). The usage meter for the members quota reads "Locuri în echipă", the exception "Limită de membri".

**S113.** The plan card says how the business pays ("plătește lunar: 349 lei"), its currency, the renewal date and that usage starts from zero on the day of the month the subscription started; the usage section is titled with the real period ("Consum: 17 oct. – 16 nov."). Discounts are in FounderBusinessBilling (FounderDiscounts).
