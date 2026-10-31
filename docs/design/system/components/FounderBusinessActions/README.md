# FounderBusinessActions

One business in Founder (S112), completing FounderBusiness:

- **Header on the phone.** Under 768px the header keeps the same pair as on desktop, under the title: the main action ("Adaugă o excepție", or "Reactivează afacerea" when suspended) and "Mai multe acțiuni". The menu holds everything else: "Deschide o sesiune de suport", "Recuperează accesul proprietarului", "Mută pe altă versiune", "Retrimite invitația proprietarului" and "Suspendă afacerea" (destructive).
- **Suspended.** "Suspendată" (neutral, lock) next to the title, a note under the header with when and who, and a line in "Ultimele modificări".
- **"Reactivează afacerea".** A confirmation that says what happens: members can sign in again right away, with the roles and app access they had. After it: a toast and "Afacere reactivată (nume)" in "Ultimele modificări".
- **Plural.** The suspension dialog's count follows Romanian plural rules (1 membru, 2–19 membri, 20 de membri, 101 membri, 120 de membri).

Shown at 1280 and 390, light and dark. Romanian only (S57); keys `founder.business.*` in `i18n/founder-business.json`.
