# BookingClientEmails

EasyBook — the e-mails from the business to its clients, in the single operational template (S3) (S116 g): confirmation, reminder before the appointment, cancellation (by the client / by the salon), change, deposit received, deposit refunded — plus the verification code from the public booking page. Keys `email.booking.*` in `i18n/booking.json`, 6 languages.

**The template.** Sender "{business} prin EasyBook" <noreply@ventora-hub.com>; the header carries the salon's name and avatar; subject = title · business; preheader = the first line; greeting; the appointment block (service, who, when, where); one button and at most one link ("Modificați sau anulați programarea"); footer "Ați primit acest e-mail pentru că ați făcut o programare la {business}." and the business's address and phone, "Trimis prin EasyBook, Ventora Systems". Tone: "dumneavoastră", DE Sie, IT Lei, ES usted.

**Content.** The confirmation adds the free-cancellation line and the link to withdraw health-data consent; the reminder (24 h before, from Settings · Reamintiri) says when the deposit stops being refundable; cancellations say what happens to the deposit; the change shows the new and the old time; deposit received shows amount, card and what is left; refund: 5–10 working days.

**Decided (S116, 4 Nov. 2026).** S116-D17 · The sender is "{business} prin EasyBook" <noreply@ventora-hub.com>; replies go to the business's e-mail.

Light only, as all e-mails; 600 and 390 wide; tests in DE, IT, EN, FR, ES.

**S125 (B.11).** The link "Modificați sau anulați programarea" opens the client's page drawn in BookingClientManage.

**S127 (B.13–B.15).** The texts can be edited in Setări · Mesaje, with variables and a preview (BookingMessageTemplates); the template itself doesn't change.
