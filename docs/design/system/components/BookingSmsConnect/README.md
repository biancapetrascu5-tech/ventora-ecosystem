# BookingSmsConnect

EasyBook — connecting the business phone (SPEC_ECRANE_SMS §2). Opens from Settings · "Trimitere SMS" → "Conectează telefonul" (owner and admin only, S12). A wide Dialog (720) on desktop and tablet; the same Dialog as a bottom sheet (`v-dialog--sheet`) on phone. Built only from existing components: Dialog, ProgressBar, SegmentedControl / Select, Checkbox, FormField, Input, Button, IconButton, StatusDot, StatusPill, Spinner, Notice.

Shown at 1280, 820 and 390 over the Settings page, then every step and every state in light and dark, desktop and phone, plus a German (desktop, steps 1 and 3) and Italian (390, steps 4 and 6) label test.

**Progress.** ProgressBar `sm` with "Conectezi telefonul afacerii · Pasul N din 7". The dialog title is the step's name. Step 7 replaces the bar with the done icon (the bar would turn lime at 100%, and lime stays for sent and delivered only).

**Steps.**
1. *Ce îți trebuie* — Android phone (dedicated, with PIN, S6), the business SIM with credit, a charger, internet. Quiet note: "Pe iPhone nu se poate: Apple nu permite trimiterea automată de SMS-uri." Link "Vezi telefoanele recomandate".
2. *Instalează aplicația pe telefon* — QR to the download page app.ventora-hub.com/telefon (desktop) or "Deschide pagina de descărcare" (phone), brand picker, numbered steps with text only (S11), "Descarcă aplicația doar de pe pagina Ventora" (S4).
3. *Scanează codul* — big QR (always dark on light, also in dark theme, so it scans), short code "K7P-42Q" with copy, "Codul expiră în 9:41", "Așteptăm telefonul…", "Generează alt cod". Moves on by itself when the phone connects.
4. *Setările telefonului* — the connected phone, brand picker, two guides (battery saving, start after restart) each with "Am făcut asta".
5. *Declarația ta* — unchecked checkbox; "Continuă" works only when it is checked. **Legal text to validate (D-SMS-7, S31):** the declaration and the "Ce înseamnă asta" page are provisional until the legal review.
6. *Trimite un SMS de probă* — number field pre-filled with the owner's number, "Trimite proba", live stages: "Predat telefonului" (neutral) → "Trimis" (lime, check) → "Livrat" (lime, double check), S19.
7. *Telefonul e conectat* — the phone's name, what leaves from it, where to see the state, what happens if it disconnects.

**States.** Code expired · phone does not connect in time (what to check) · phone already connected to another business · other brand (Xiaomi) · checks done · declaration checked · test handed / sent / delivered · test failed with the reason (danger, "Trimite din nou") · test without confirmation (neutral, S9) · leaving before the end (proposal).

**Not here (§11).** No commercial offer, no prices, no technical terms.

**Approved 25 Oct 2026 (S25–S33).** Step 3 moves on by itself; leaving after step 3 keeps the phone connected but silent until the declaration and test are done ("Continuă conectarea" in Settings); the phone is named at step 7; "A ajuns, continuă" for a test without confirmation, and "Continuă" after "Trimis"; brand guides for Samsung, Xiaomi, Motorola, Google Pixel and other brands (on phone, a Select); the SIM is paid at the operator, never "abonament"; "aplicația Ventora pornită" (works in the background); download address app.ventora-hub.com/telefon.
