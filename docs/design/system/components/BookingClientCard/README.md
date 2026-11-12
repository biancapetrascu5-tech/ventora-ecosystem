# BookingClientCard

EasyBook — the client card in the Hub (S116 c): the appointment history with each status, the behaviour note "Risc ridicat" after repeated no-shows, and who sees what. Keys `booking.client.*` in `i18n/booking.json`, 6 languages.

**The card.** Header with the name, the pill "Risc ridicat" (attention) and "Programare nouă". Stats: visits, no-shows, late cancellations, collected in total. The note (Notice, attention): "Risc ridicat: nu a venit de 2 ori în ultimele 6 luni", the dates, the consequence (online, a deposit is asked for any service) and "Nota o văd proprietarul, adminii și recepția. Clientul nu o vede." The history is a DataTable (late cancellations carry "Târzie"). On the side: contact, team notes, health information (BookingHealthFields).

**Who sees it.** Owner, admins and reception: everything. A member: only their own appointments with the client, no note, no health information ("Vezi doar programările tale…").

**Removing the note.** "Șterge nota…" (owner) asks for a reason, written to the business log; the note comes back automatically at the next no-show. The owner gets an alert when a client reaches "Risc ridicat" (automation "Alertă: client cu „Risc ridicat”", HubAutomations).

**Decided (S116, 4 Nov. 2026).**
- S116-D10 · "Risc ridicat" after 2 no-shows in 6 months.
- S116-D11 · The note is seen by the owner, admins and reception.
- S116-D12 · The owner and admins may remove it.

**To confirm with the lawyer.** The client's access to the note "Risc ridicat" (right of access to profiling).

Shown at 1280 and 390, in light and dark, with a DE/IT test.

**S125 (B.7).** The tab "Încasări" next to "Programări" (BookingClientPayments) and "Blochează clientul…" in the menu, with the salon's list of blocked clients (BookingBlockedClients). The new texts are Romanian only for now.

**S126 (B.9).** "Pachete": sessions used and left, "Vinde un pachet…" (BookingPackages).

**S139 (B.7).** "Îmbină cu alt client" (BookingClientMerge). The behaviour note "Risc ridicat" appears only when "Nota de comportament" is on in Setări › General — off by default (BookingBehaviorNote).
