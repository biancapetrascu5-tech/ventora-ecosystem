# HubMyRecommendations

Hub — "Recomandările mele" for a member (S136, 5.9). In "Contul tău" in the Hub Spine, after "Profil și preferințe"; also reached from the bell. Keys `mine.*` in `i18n/commercial.json`, in the 6 languages (drawn in Romanian).

**The list.** What the member recommended to the owner, from the Catalog (RecommendationCard, `role="member"`): the app icon, the name, the state ("În așteptare", "Activată", "Nu acum" — the same pills as RecommendationCard), "Recomandată lui {owner} pe {date}", and the owner's answer with its date, or "Proprietarul n-a răspuns încă. Primești o notificare când decide." An activated one has "Deschide {app}". Only the member and the owner see this list.

**The bell.** Only activation sends a notification ("{owner} a activat {app}"); "Nu acum" sends none (CommercialStates) — the member sees it here.

**The rule** (under the list): the decision and the payment stay with the owner; a recommendation answered "Nu acum" can be sent again after 30 days.

**States.** No recommendations ("Nicio recomandare", "Deschide Catalogul").

Shown at 1280, 820 and 390, light and dark.

**S147 · Nota și motivul (13.11).** Membrul: „Recomandă aplicația” deschide un dialog cu nota opțională pentru proprietar (cel mult 300 de caractere, cu contor și eroare peste limită). Proprietarul / adminul: notificarea și cardul „{nume} recomandă {app}” (cheia `recommendsApp`, 6 limbi) cu nota; „Respinge” are motivul opțional, pe care membrul îl vede sub „Nu acum”. Chei `reco.*`, `recommendsApp` în `i18n/commercial.json`. Test DE / IT.
