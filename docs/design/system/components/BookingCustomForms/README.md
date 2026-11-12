# BookingCustomForms

EasyBook — questions at booking (custom forms, B.12, S127). Romanian only for now; keys `booking.forms.*` in `i18n/booking.json`.

**The builder.** Setări · "Rezervări online" · "Întrebări la rezervare": the questions in the order the client sees them (drag handle; on a phone, "Mută mai sus / mai jos" in the menu), the answer type, where they appear ("Toate serviciile" or the chosen ones), required or not. Types: short text, long text, yes / no, one choice, several choices, number, date. A line sends health questions to the health fields (separate consent).

**The editor** (Drawer): the question, the type, the options for choices (at least two, in order), a help text, the services (empty = all), "Răspunsul e obligatoriu", "Apare și când echipa face programarea din Hub". Errors: no question, fewer than two options.

**Public page.** At the details step, "Câteva întrebări de la salon", only those for the chosen service; a required answer missing shows "Răspundeți la această întrebare."

**Booking detail.** "Răspunsuri la întrebări", "Fără răspuns" for the optional ones left empty.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S127).**
- **File uploads (a photo of the desired look).** Recommendation: not in the pilot (storage and personal data); "Da / Nu" plus a note instead.
- **How many questions.** Recommendation: at most 5 per service, so booking stays short.
- **Answers on the client card.** Recommendation: they stay on the booking; the last answer to each question is shown on the client card too.

**S146 · Health and photos.** A peach Notice, always visible in the builder and the editor: "Nu puneți aici întrebări despre sănătate (alergii, afecțiuni, tratamente). Pentru ele folosiți câmpurile medicale, care cer acordul separat al clientului.", with "Deschide câmpurile medicale" (B.8) when the business has them on; otherwise "Câmpurile medicale sunt oprite pentru afacerea ta." (`booking.forms.health.*`). In the editor, "Clientul poate adăuga o poză" (toggle) with "PNG sau JPEG, max. 10 MB, o poză pe întrebare."; in the list the question carries "Cu poză" (`booking.forms.photo.*`). **On the public page** (BookingPublic): "Adăugați o poză" with FileUpload — choose, uploading, done (thumbnail, name, size, "Șterge poza"), errors: wrong type (HEIC), too big, more than 5 photos on the booking (`booking.public.photo.*`); "Poza o vede doar salonul și se șterge la 30 de zile după programare." All 6 languages; DE / IT tests. This settles the S127 "File uploads" item.

**DE DECIS (S146).** **Keeping photos.** Recommendation: deleted 30 days after the appointment (the text says so); not copied to the client card or to ClientDesk. **The warning's tone.** The text is the one asked for ("puneți", "folosiți"); the rest of the business interface uses "tu" — recommendation: "Nu pune aici… Pentru ele folosește câmpurile medicale…" in Romanian.
