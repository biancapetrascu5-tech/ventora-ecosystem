# PortalPresence

Portal in the business launcher: not an app the business works in, but its page for clients — shown as its own card under the AppDock, never as one more icon.

**Props.** `status` (`published` "Publicată", `hidden` "Ascunsă", `draft` "Nu e publicată încă"), `canManage` (owner, admin and the Portal app manager; members see the card without the manage button and with "Pagina o pot schimba proprietarul, adminii și managerul aplicației Portal."), `onManage`, `onPreview` or `previewHref`, `compact` (tablet and phone: buttons stacked, full width).

**What each action does.**
- "Gestionează pagina" — opens the Portal-presence pages inside the business platform (app.ventora-hub.com), in the same tab, with `AppLaunch` from the card. On a page that isn't published yet the button reads "Termină pagina".
- "Vezi cum arată în Portal" — opens the public page on portal.ventora-hub.com in a new tab, exactly as clients see it; the external-link icon says so and screen readers hear "(se deschide într-un tab nou)". Not shown while the page is not published.

**Who sees it.** Owner, admin, the Portal app manager and members (members only look); external collaborators don't see the card. Status pill: lime for published, neutral for hidden, peach for "not published yet" (it needs you).

**Texts.** Eyebrow "Portal · pentru clienții tăi", title "Pagina afacerii în Portal", line "Clienții te găsesc în Portal și își fac programări acolo. De aici schimbi ce văd ei." — in all six languages in the bundle.
