# HubBusinessSuspended

A business suspended by the Ventora team, as the person sees it in the Hub (S112). No reason is ever shown, and nothing is red: the person has nothing to fix.

- **Only business:** this screen replaces "Alege afacerea": the business mark with "Acces oprit", „Accesul la {afacere} e oprit momentan”, „Pentru detalii, ia legătura cu echipa Ventora la support@ventorasystems.com.” (the address is a link), "Scrie-ne la suport" and "Ieși din cont".
- **Several businesses:** the suspended one stays in HubChooseBusiness with "Acces oprit" and cannot be opened; a note under the list says why and where to write. In OrgSwitcher (and in the account menu on the phone) its row shows "{rol} · Acces oprit" with a lock and cannot be chosen (OrgSwitcher `suspended`). The other businesses work as usual.

Shown at 1280 and 390, light and dark, with a German and Italian test. Keys `hub.suspended.*`, `hub.chooseBusiness.*` and `accessStopped` in `i18n/business-access.json`, 6 languages.
