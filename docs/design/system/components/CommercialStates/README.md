# CommercialStates

The states that complete the commercial components: catalog search without results; the trial ending in 3 days and the trial ended (the app pauses, data stays, continuing is a choice); a team recommendation declined (admin) and turned on (member notification); a slot hidden by a cap or a dismissal; the member's recommendation states; "Ajunge la {nume} (proprietar)." Light and dark.

**Currency (S113).** Prices stay in the business's currency in every interface language: the DE/IT test no longer turns "lei" into "€".

**Texts (S136).** In `i18n/commercial.json`, in the 6 languages: `states.*` (search without result, trial ending and ended, a team recommendation declined or activated, the member states, "Recomandă aplicația"; names, apps, dates and prices are parameters). The library keeps its own copy in `S`; the file is what the apps load.
