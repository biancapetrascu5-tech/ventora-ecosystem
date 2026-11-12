# ClientDeskDeals

ClientDesk — deals (S131, CR-UI.5), built on CrmPipeline. Romanian only for now; keys `crm.deals.*` in `i18n/crm.json`.

**The pipeline.** Kanban with the stages, each stage's count and value, and "Câștigate în noiembrie" (lime check). Header: "8 dealuri deschise · 77.900 lei · ponderat cu probabilitatea: 38.600 lei", "Editează etapele", "Deal nou". The pipeline picker ("Vânzări salon", "Evenimente corporate", "Gestionează pipeline-urile…") and "Toată echipa" / "Doar ale mele". Cards: next step, peach "Sună azi" and "Blocat de 16 zile"; "Din lead" for converted leads. On a phone one stage at a time.

**The deal** (Drawer): value (the sum of the items, read-only), probability (starts from the stage), expected close date, stage, contact, company, owner. "Servicii și elemente": services from the EasyBook catalogue ("Din catalogul EasyBook", marked "EasyBook", with the catalogue price changeable only for this deal) and free items with a price ("Element liber", marked "Liber"); quantity × price, total. Without EasyBook active: only free items, said so. The history. Footer: "Pierdut", "Câștigat".

**Stuck 14 days.** A peach Notice in the Drawer ("Nicio mișcare de 16 zile în „Ofertă trimisă”"), "Programează un apel", "Trimite un e-mail"; the deal also shows in "Au nevoie de tine".

**Won** (Dialog): final value, date, why (optional), "Creează o sarcină pentru pasul următor". The deal moves to "Câștigate în noiembrie" and into reports; it can be reopened. **Lost** (Dialog): reason (required: price, chose someone else, no reply, postponed, no budget, other), note, "Revino la el pe" (a task that day).

**Several pipelines.** At most 2; each with its own stages; one is the default. At the limit, "Pipeline nou" is disabled with the explanation.

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S131).**
- **Probability.** Recommendation: a default per stage (Contact nou 10%, Ofertă trimisă 30%, Negociere 60%), changeable per deal; the weighted total is shown next to the total.
- **"Stuck".** Recommendation: 14 days with no activity and no stage change; the number of days per business.
- **Lost reason.** Recommendation: required (drawn this way), from a list the business can edit.
- **Won → EasyBook.** Recommendation: no automatic bookings; the "Programează în EasyBook" task (drawn this way), later a button that opens BookingNew with the services.
- **2 pipelines.** Recommendation: the plan limit (drawn this way); more pipelines in a larger plan, not as an add-on.
