# BookingReports

EasyBook — reports (S128), the Spine's "Rapoarte". Romanian only for now; keys `booking.reports.*` in `i18n/booking.json`.

**Filters.** The period (this month, last month, last 30 days, this year, another range with a DatePicker) and the member; "Exportă" (Excel, CSV).

**Tabs.**
- **Ocupare:** occupancy, hours booked of the hours scheduled, free hours (with the change against last month); occupancy per member and per weekday.
- **Venituri:** collected, due, deposits, refunds; collections per day with last month for comparison; collections per payment method.
- **Anulări și neprezentări:** cancellations, of which late, no-shows, fees kept; per weekday; the clients with the most no-shows.
- **Servicii:** bookings, revenue, average price, cancelled, change against last month.
- **Echipă:** bookings, hours, occupancy, revenue, returning clients.

**Export.** A Dialog: Excel or CSV, which reports, the period; one row per booking with amount, payment method and status. Ready: a Toast with the file and "Descarcă". Empty: "Nicio programare în perioada aleasă".

Shown at 1280, 820 and 390, light and dark.

**DE DECIS (S128).**
- **Who sees the reports.** Recommendation: the owner and admins see everything; reception sees occupancy only; a member sees only their own numbers.
- **Occupancy.** Recommendation: booked hours divided by scheduled hours (Programul echipei), leave and exceptions excluded.
- **Revenue.** Recommendation: what was collected (cash basis), by payment date; refunds subtracted on their own date.
