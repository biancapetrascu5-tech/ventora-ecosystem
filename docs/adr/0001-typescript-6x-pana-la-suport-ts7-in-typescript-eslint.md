# ADR 0001 — TypeScript 6.x până la suportul oficial TypeScript 7 în typescript-eslint

**Status:** CONFIRMAT
**Data:** 2026-10-24
**Aprobat de:** Fondatori (decizie luată în sesiunea de upgrade versiuni)
**Referință:** —

---

## Context

La 21 octombrie 2025, TypeScript 7.0 a devenit stabil. Scheletul monorepo-ului a fost actualizat la
versiunile majore curente ale tuturor dependențelor. La instalarea TypeScript 7.0.2 s-a descoperit că
`typescript-eslint@8.72.0` (dependență tranzitivă prin `eslint-config-next@16.4.3`) refuză explicit
TypeScript 7.0 cu eroarea:

```
typescript-eslint does not support TS 7.0.
See https://github.com/typescript-eslint/typescript-eslint/issues/10940
for tracking typescript-eslint's support for TS >=7.1
```

Lint-ul eșua complet în toate cele trei aplicații. Suportul pentru TS 7 este urmărit în
[typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
și va fi adăugat pentru TS >=7.1, nu pentru 7.0.

## Decizie

Rămânem pe TypeScript `^6.0.0` (ultima stabilă: 6.0.3) până când `typescript-eslint` anunță suportul
oficial pentru TypeScript 7. La momentul migrării se rulează din nou toate verificările: lint,
format:check, typecheck, test, i18n:check, build, pornire aplicații.

## Justificare

TypeScript 7.0 introduce un compilator paralel (Go) cu un API incompatibil cu `typescript-eslint` 8.x.
Workaround-ul oficial Microsoft (folosirea API-ului TS 6 din interiorul TS 7) este neoficial, complex
și nestabilizat pentru 7.0; suportul real vine în 7.1+. A introduce un shim acum ar crea un strat
de compatibilitate fragil care nu aduce niciun beneficiu funcțional față de simpla rămânere pe 6.x.

## Alternativele evaluate

| Opțiune | Argumente pro | Argumente contra |
|---|---|---|
| **TypeScript 6.x (ales)** | Toolchain complet funcțional, zero fricțiune, upgrade clar mai târziu | Nu beneficiem de optimizările de performanță TS 7 |
| TypeScript 7.0 + shim API TS 6 | Versiune mai nouă | Neoficial, fragil, nu aduce avantaje reale în această fază |
| Așteptare TypeScript 7.1 | Suport oficial `typescript-eslint` | Dată nedefinită, incertitudine |

## Consecințe

- Toate `package.json`-urile din monorepo declară `"typescript": "^6.0.0"`.
- La apariția suportului oficial (urmărit în typescript-eslint#10940), se creează un commit separat
  cu upgrade-ul la TS 7.x și se rulează din nou toate verificările.
- Nu există impact asupra funcționalității aplicațiilor; TypeScript 6.0.3 suportă toate
  funcționalitățile utilizate în proiect.

## Referințe

- [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
- [TypeScript 7.0 announcement — Running side-by-side with TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0)
