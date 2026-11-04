# FounderBundles

Founder · "Bundle-uri" (formerly FounderPlans, renamed after S117: there are no "plans" any more). Bundles with versions: apps, price, limits, sale period, and how many businesses have each version. Any change creates a new version (a new offer); businesses keep theirs and its price.

**S112.** The members limit reads "membri" when counted ("10 membri") and "Locuri în echipă" as a resource or pack ("5 locuri în echipă în plus"); "Angajați" is only for the business's staff inside the apps.

**Monthly or yearly, lei or euro (S113).** Each version shows four prices: monthly and yearly, in lei and in euro, with what the yearly price saves ("economie 698 lei"). The yearly price is typed in, never a percentage; euro is typed in, never converted. Limits stay monthly on the yearly plan. Keys in `i18n/founder-pricing.json`.

**Bundles (S117).** The page becomes "Bundle-uri" (Spine: after "Aplicații"). Each bundle: its apps, the price per month and per year in lei and euro, the same apps bought separately and the saving ("Economie: 47 lei pe lună (13%)"), the limits and team seats included ("7 locuri în echipă în plus (10 cu cele din cont)"), the implementation, the sale period ("Disponibil 1–30 noiembrie") and status — "În vânzare", "Programat", "Vânzare oprită pe 28 oct.". Versions: each offer, with its sale period, prices and how many businesses have it ("Oferta de acum", "Încheiată"); businesses keep the bundle and its price after the offer ends. "Oprește vânzarea" asks for confirmation (the bundle leaves the catalog now; the businesses that have it keep it) and confirms with a toast; "Ofertă nouă" opens FounderPlanEditor. Keys `founder.bundles.*`.

**Name (S117, P-S117-6).** The component is `FounderBundles`; `FounderPlans` is gone. The Spine entry "Bundle-uri" has the id `bundles`.

**Layout (S119).** Each card has the SheetSection padding (`space-6`; `space-4` on phones). The top row ("Preț bundle" / "Aceleași aplicații la bucată" / "Include") and the versions table share one column grid: the three blocks start where "Versiune", "Lunar" and "Afaceri" start. More space under the title before "{n} afaceri îl au" (`space-2`).
