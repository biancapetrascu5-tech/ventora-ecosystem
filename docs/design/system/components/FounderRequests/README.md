# FounderRequests

"Cereri din Hub" in Founder Control Center (S111): what businesses asked for from the Hub — "Cere activare" (a pack marked "Doar la cerere", any pack without a saved card, or an app) and "Cere alt abonament". A new Spine entry "Cereri", after "Consum", with the number of new requests (all Founder previews now carry it). Romanian only (S57); keys `founder.requests.*` in `i18n/founder-commercial.json`.

**The list.** A SegmentedControl "Noi · {n}" / "Toate" and a DataTable: the business, what (the type in bold and the item), who asked, when, the status — "Nouă" (peach: it needs you), "Rezolvată" (lime), "Refuzată" (neutral). Row menu for a new request: "Deschide afacerea", "Marchează rezolvată", "Refuză…"; for the others only "Deschide afacerea". Empty: "Nicio cerere nouă" / "Când o afacere cere o activare sau alt abonament din Hub, apare aici."

**Resolve.** "Marchează rezolvată" after doing the change in the business page; Toast "Am marcat cererea ca rezolvată. {name} primește o notificare în Hub." (`notifications.request.resolved.*`).

**Refuse.** A Dialog "Refuzi cererea de la {business}?" with what was asked, and "Motiv" (required); the person who asked sees it in the Hub notification (`notifications.request.refused.*`).

Shown at 1280 and 390, in light and dark.
