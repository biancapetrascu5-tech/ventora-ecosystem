# GrowthOfferEditor

Offer editor: type, commercial object, action (always opens UpgradeDialog), costs read only from the commercial model, texts in 6 languages with approval status, and a RecommendationCard preview in light and dark.

**Texts (S136).** The screen's texts are in `i18n/founder-growth.json`: `founder.growth.offerEditor.*`, plus the shared `founder.growth.common.*`. Romanian only for now. Translations of offer and campaign texts are managed in FounderTranslations.

**S149 · Bugetul ofertei (1.1.0).** Secțiune nouă, între „Ce oferă” și „Texte”. Câmpul este „Câte perioade de probă dăm în total”, opțional: gol înseamnă fără limită. Sub câmp se vede consumul, „142 din 200 folosite”, cu bară și „Mai sunt 58 perioade de probă până la limită”. De la 90%, restul apare ca pastilă de atenție. Fără limită, se vede „38 folosite · fără limită”. Mereu e scris ce se întâmplă la limită: oferta se oprește singură (motivul: buget atins), fondatoarea primește notificare (FounderNotifications), iar afacerile care au început deja perioada de probă o păstrează. La limită apar Notice-ul „Bugetul s-a terminat: oferta s-a oprit”, butonul „Mărește bugetul” și pastila din antet „Oprită · buget atins”. Erori: sub cât s-a folosit deja, sau 0. Cheile sunt `founder.growth.offerEditor.budget.*` în `i18n/founder-growth.json`, în 6 limbi. Desenat în context (setat și oprit) și ca stări A–F, cu test DE / IT.

DE DECIS:

- **Dacă oprirea la buget se poate reporni fără să mărești bugetul.** Recomandare: nu.
- **Pragul de avertizare.** Recomandare: 90%, cu notificare și în clopoțel.
- **Unitatea pentru alte tipuri de ofertă** (activări, pachete). Recomandare: același câmp, cu unitatea tipului ales.
- **Bara la 100%** folosește tonul implicit al ProgressBar (verde la complet). Recomandare: o lăsăm așa, Notice-ul spune clar că s-a oprit.
