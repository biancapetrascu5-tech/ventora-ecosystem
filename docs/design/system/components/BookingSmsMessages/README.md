# BookingSmsMessages

EasyBook — the messages sent to the client, on an appointment's detail (SPEC_ECRANE_SMS §3). A new section "Mesaje către client" in the approved BookingDetail drawer, after the actions and before the team notes. Built only from existing components: StatusPill, Icon, Button, Dialog, Toast, and the drawer's own "Istoric" list.

Shown at 1280 (480 drawer), 820 (560 side panel) and 390 (full screen), light and dark, with every message state below and a German (480) and Italian (390) label test.

**A message row.** Type ("Reamintire", "Confirmarea programării", "Programare mutată", "Programare anulată"), channel ("Telefonul afacerii", "Prin Ventora", "E-mail"; with two or more phones also the phone's name, S7), its scheduled time, and a StatusPill with the state and its time. Under the row: "Pleacă la {ora}", the reason, or the "Fără confirmare" explanation. Below 420px the pill moves under the text.

**States (S19).** Neutral: "În așteptare", "Predat telefonului", "Fără confirmare", "Anulat". Lime: "Trimis" (check) and "Livrat" (double check, only with a confirmation). Danger: "Nu s-a trimis", always with a reason in plain words ("Telefonul nu avea semnal.", "Fără credit pe SIM.", "Programarea a început înainte ca telefonul să revină online."). E-mail has only "Trimis", "Livrat", "Nu s-a trimis" (S17).

**History (S16).** The row is a button (aria-expanded); it opens the message's states with their times, then the text sent to the client (in "dumneavoastră").

**Resend.** "Trimite din nou" for "Nu s-a trimis" (when it still makes sense) and "Fără confirmare". For "Fără confirmare" a Dialog warns: "Clientul poate primi mesajul de două ori." A Toast confirms the message is waiting again.

**Also.** No messages yet; SMS turned off (only e-mail rows, link to Settings · Trimitere SMS).

**Approved 25 Oct 2026 (S34–S38).** History uses the drawer's "Istoric" list. The sent text shows only while it is kept on the server; afterwards: "Textul nu se mai păstrează după 30 de zile. Starea și ora rămân." Client SMS are written without Romanian diacritics and in at most 160 characters; under the text a quiet "1 SMS · 119 caractere" (counted on the GSM alphabet: 160 per SMS, 70 as soon as one character is outside it). E-mail keeps diacritics and has no counter.
