# ClientDeskHome

ClientDesk — the shell and the home page (S130, CR-UI.1). Romanian only for now; keys `crm.nav.*`, `crm.home.*` in `i18n/crm.json`.

**The shell.** Spine with app `crm`: "Pagina principală" (short "Acasă" in the bottom bar), "Contacte", "Companii", "Leaduri", "Dealuri" (the pipeline, CrmPipeline), "Activități"; under "Afacere": "Rapoarte", "Setări". The bottom bar on a phone: Acasă, Contacte, Dealuri, Activități. The Spine footer shows "Contacte în abonament" (UsageMeter, 3.000; EasyBook contacts don't count).

**The home page.** Greeting and the day; "Contact nou". Four Stat tiles: new contacts this month (with the change against last month), open leads, deals in progress with their value ("în valoare de 77.900 lei"), overdue tasks (peach when not zero). "Au nevoie de tine" in three SheetSections with AttentionList: overdue tasks ("Gata", "Deschide"), leads with no reply after 24 hours ("Răspunde"), deals stuck 14 days in the same stage. The side column: the GrowthSlot (a RecommendationCard, here CampaignKit for inactive clients, or nothing — no gap) and "Azi" (today's activities). On a tablet and phone the side column goes under.

**States.** Everything up to date ("Totul e la zi"; the empty GrowthSlot renders nothing). First day: no contacts, "Adaugă un contact", "Importă din CSV", and the note that EasyBook clients appear on their own. A member: "Contactele mele" and their own numbers; "Vezi contactele atribuite ție și pe cele neatribuite."

Shown at 1280, 820 and 390, light and dark. DE DECIS in ClientDeskContacts.
