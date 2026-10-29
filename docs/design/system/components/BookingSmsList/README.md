# BookingSmsList

EasyBook — the list of messages sent to clients (SPEC_ECRANE_SMS §5): Settings · Trimitere SMS · "Vezi toate mesajele", also opened from the four numbers in Settings and from the alerts in Azi, with the matching filter already set. Built only from DataTable, PageHeader, Input, SegmentedControl, Select, StatusPill, EmptyState, Notice, Button and Toast.

Shown at 1280, 820 and 390, light and dark, with every state from the spec and a German (820) and Italian (390) label test.

**Columns.** Client (with the phone number), Programare, Tip, Canal, Ora, Stare (StatusPill with the state's time, S19; under it "Pleacă la {ora}" or the reason). Newest first. On tablets Tip and Canal hide (optional columns); on phones each message is a card: client, "Reamintire · 16:00" (plus the channel when it is not the business phone), and the state.

**Filters.** Search by client, period (Azi, 7 zile, Luna), state (including "Fără confirmare"), channel; active filters show as removable pills.

**Row.** A click opens the appointment's drawer at that message (§3). The menu: "Deschide programarea" and, for "Nu s-a trimis" and "Fără confirmare", "Trimite din nou" (same rules as S36). No bulk actions.

**States.** Opened with a filter · loading (skeleton rows) · empty (no message yet) · no results in the filtered period but some elsewhere (P12, "3 mesaje în alte zile") · empty with filters · loading error · export done (period and filters in the confirmation) · member (no phone numbers, no export — proposal) · phone list with a filter.
