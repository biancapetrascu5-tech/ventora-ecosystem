# BookingHealthFields

EasyBook — optional health fields with explicit consent (S116 e): the salon configures them, the client fills them only with a separate, unchecked consent, consent can be withdrawn, and only named people see them. Keys `booking.health.*` in `i18n/booking.json`, 6 languages. **The legal text is a placeholder until the lawyer's opinion; the fields do not go live for clients before that.**

**Settings · Câmpuri medicale.** On/off; the fields (label, short text or yes/no, the services where they are asked; the examples: known allergies, skin or scalp conditions, pregnancy, treatments that may affect the service); "Adaugă un câmp"; who sees the answers ("Membrul care face programarea și proprietarul", default, or "Toată echipa"); the consent text (placeholder).

**The client (BookingPublic, frames 8b–8c).** "Informații medicale (opțional)", who sees them, the fields, the consent checkbox (required only when a field is filled; error otherwise) with how to withdraw.

**The client card.** The answers and "Consimțământ dat pe {date} · prin rezervarea online"; a member who does not do the appointment sees only who can. Withdrawal: recorded by the salon ("Înregistrează retragerea consimțământului…", how the client asked) or by the client from the confirmation e-mail link; the answers are deleted at once, only the dates of consent and withdrawal stay.

**Decided (S116, 4 Nov. 2026).**
- S116-D15 · On withdrawal the answers are deleted at once; only the dates of consent and withdrawal stay.
- S116-D16 · By default, the member doing the appointment and the owner see the answers.

**To confirm with the lawyer.** How long the answers are kept without a withdrawal (proposal: deleted 24 months after the last appointment).

Shown at 1280 and 390, in light and dark, with a DE/IT test.

**S125 (B.8).** The read log — who opened the health information, when, from where — on the client card, for the owner and admins (BookingHealthAccessLog). Romanian only for now.
