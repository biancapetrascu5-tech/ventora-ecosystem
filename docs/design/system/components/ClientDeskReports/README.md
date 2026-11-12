# ClientDeskReports

ClientDesk — reports (S134, CR.16). Romanian only for now; keys `crm.reports.*` in `i18n/crm.json`. Built with Stat, LineChart, BarChart, DataTable, Tabs.

**Tabs.**
- **Vânzări:** won value, win rate, weighted pipeline, average days to win (each with the change against the previous period); won value per month (grey: the same months last year); why we lose (top reasons); deals per stage and how many are stuck.
- **Leaduri:** new leads, converted, average time to first reply, disqualified; new leads by source; conversion by source; disqualified by reason.
- **Activitate echipă:** per member — calls, meetings, tasks done, overdue (peach), deals won with their value.
- **Contacte:** new / recurring / inactive (with the trend per month), where contacts come from (EasyBook included), the contact limit with the forecast; EasyBook contacts don't count.
- **E-mail:** sent, delivered, opened (indicative: only contacts with marketing consent, only when images load), replied; per template and per sequence — sent, opened, click, replies, unsubscribes, bounced.

**Filters.** Period (including a custom range), pipeline, member, source (Drawer on a phone), "Compară" with the previous period of the same length, "Exportă CSV" (which reports; numbers only, no contact data; written to the business log).

**Who sees what.** Owner and admins: everything. A member: only their own numbers, tabs Vânzări, Leaduri, Activitate echipă, with a Notice.

**States.** A period with no activity; no data yet ("Deschide dealurile").

Shown at 1280, 820 and 390, light and dark.
