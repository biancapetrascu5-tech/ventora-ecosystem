# HubSupportThread

One support request in the Hub (S111), opened from "Solicitările mele" (HubSupport). Every text is a key in `i18n/support.json`, in the 6 languages.

**Header.** The subject as the title, "Solicitările mele" as the way back, the status pill and "{app} · deschisă pe {date} · {ref}". Statuses: "Răspuns nou" (peach: it waits for you), "În lucru" (neutral), "Rezolvat" (lime).

**The thread.** Messages oldest first. Each has the avatar, "Tu" or the person's name with the badge "Echipa Ventora", the time, the text and its attachments (name, size, download). The team's messages sit on `raised`, yours on `sheet`. On phones the cards go full width.

**Replying.** "Răspunsul tău" (Textarea), "Atașamente" (FileUpload: PNG, JPG or PDF, at most 10 MB each, several files) and "Trimite răspunsul". States: files uploading and uploaded; errors — empty message ("Scrie un mesaj înainte să trimiți."), a file over 10 MB ("{file} are peste 10 MB. Trimite un fișier mai mic."), a file of another type ("{file} nu e PNG, JPG sau PDF."); sending (Button `loading`); sent (Toast "Am primit mesajul." / "Îți răspundem aici și pe e-mail, în cel mult o zi lucrătoare.", the status goes to "În lucru").

**Status history.** "Istoricul stării" beside the thread (under it on phones), newest first: opened, in progress, new reply, resolved, reopened — each with who and when.

**Resolved and reopened.** A solved request replaces the reply box with "Solicitarea e rezolvată. Dacă problema a revenit, o poți redeschide." and "Redeschide solicitarea". Reopening asks "Ce s-a întâmplat din nou?" (required, attachments allowed), says "Când trimiți, solicitarea trece înapoi în „În lucru”." and sends with "Redeschide și trimite"; Toast "Am redeschis solicitarea."

**E-mail.** A new reply from the team sends E-7 "Ai un răspuns nou la solicitarea ta" (BookingSmsNotifications, cards 13–16) and the notification "Răspuns nou la solicitarea ta" (`notifications.support.reply.*`).

Shown at 1280 and 390, in light and dark, with a German and Italian test.
