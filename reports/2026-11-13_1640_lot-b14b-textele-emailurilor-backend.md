# Lot B.14b, partea 1: textele e-mailurilor scrise de afacere (backend și contract)

**Branch:** `feat/b14b-booking-message-templates`, peste B.14 (#206, încă neintrat pe main).
**Status:** PROPUS. Migrarea `20261114000001_booking_message_templates` e de revizuit.
**Partea 2, ecranul Setări › Mesaje** (galeria, capturile, verificarea vizuală): urmează, într-un PR separat.

## Deciziile fondatoarei (13.11)

- **Ce intră:** backend-ul și ecranul (ecranul e partea 2).
- **Ce schimbă afacerea:** subiectul și textul. Blocul programării, linia de politică, butonul și subsolul rămân fixe.
- **Limba:** un text pe limbă. Un client a cărui limbă nu are text al afacerii primește textul Ventora.
- **Momentul trimiterii:**
  - designul S127 arată alegerea lui: un Select cu „Imediat”, „La {n} ore după vizită”, „A doua zi, la 10:00” și numărul de ore;
  - deci **B.14c** (alegerea momentului) intră în primul pachet, imediat după B.14b;
  - aici momentele rămân cele din B.13 / B.14.

## Lista de bifat

| Punct | Fișiere | Test |
| --- | --- | --- |
| Tabelul `message_template`: un rând pe afacere, mesaj și limbă. `subject` / `body` NULL înseamnă textul Ventora. Fără DELETE; RLS USING + WITH CHECK; UPDATE doar pe coloane | migrarea, `schema.prisma` | `services.integration.test.ts` (lista tabelelor cu RLS), drift „No difference detected” |
| Variabilele S127: `{client}` (prenumele), `{service}`, `{date}`, `{time}`, `{member}`, `{business}`, `{link}`. O variabilă necunoscută e refuzată: `unknown_variable:<nume>`, pentru „Variabila {var} nu există” | `server/template-text.ts` | `template-text.test.ts`; integrarea: „refused: an unknown variable…” |
| Limitele: subiectul 1–150 de caractere, pe un rând; textul 1–2.000 de caractere | `template-text.ts`, migrarea (CHECK) | aceleași |
| Textul Ventora scris cu variabile: de aici pornește editorul și la el duce „Revino la textul inițial” | `server/message-templates.ts` (`defaultTemplate`) | „Ventora’s text first…” |
| Salvarea și revenirea, cu auditul (`booking.settings_updated`, cu `messageTemplate: { kind, locale, action }`; fără textul propriu-zis) | `message-templates.ts` | „Ventora’s text first…”, „Revino la textul inițial…” |
| E-mailul trimis folosește textul afacerii în limba clientului; un client în altă limbă primește textul Ventora | `server/client-emails.ts` (`custom`, `takesCustomText`, `firstName`) | „Ventora’s text first; the business’s RO text goes to RO clients, a DE client keeps Ventora’s” |
| Blocul programării, linia de politică (confirmarea), butonul și subsolul rămân | `client-emails.ts` | același test |
| Mutarea și anularea: textul afacerii doar pentru acțiunea ei; anularea sau mutarea făcută de client păstrează textul scurt Ventora | `client-emails.ts` (`takesCustomText`) | „the change and the cancellation…” |
| Previzualizarea: cu textul nesalvat și programarea de exemplu din design (Cristina Dobre, Vopsit rădăcină, Ioana Pavel), numele și prima adresă a afacerii. Nu scrie și nu trimite nimic | `server/message-preview.ts` | „the preview…” |
| Contractul: `listMessageTemplates`, `getMessageTemplate`, `saveMessageTemplate`, `resetMessageTemplate`, `previewMessageTemplate`, toate cu `booking:settings` | `contract/message-templates.ts`, `contract/index.ts` | testele de integrare de mai sus |

## PROPUS (de confirmat)

- **Subiectul:** păstrează forma din B.13, „titlu · afacere”. În S127, previzualizarea arată doar „Mulțumim, Cristina!”.
- **Textul de la anulare și mutare** e al acțiunii salonului. Când anulează sau mută clientul, pleacă textul scurt Ventora: variabilele nu pot spune cine a făcut acțiunea.
- **`{link}`:** linkul butonului e-mailului. La confirmare, reminder și mutare duce la pagina clientului; la anulare și mulțumire, la pagina de rezervare.
- **`{date}`** e ziua în format lung („joi, 19 noiembrie”), **`{time}`** ora („10:00”), în limba clientului și în fusul afacerii.
- **Auditul** folosește acțiunea existentă `booking.settings_updated`, ca să nu schimb `core/audit`.

## Abateri

- **`{review}`** (din lista S127) nu e acceptată încă: linkul de recenzie vine cu B.16.
- **Rândurile de echipă, cererea de recenzie și canalul SMS** din S127 vin cu B.15, B.16 și B.17. Partea 2 le va arăta doar în galerie, cu datele designului.

## NEFĂCUT

- **Ecranul Setări › Mesaje:** partea 2.
- **Alegerea momentului trimiterii:** B.14c.

## Verificări rulate local

- **Integrarea booking** (`b-files.mjs`): drift „No difference detected”, **323/323**.
- `template-text.test.ts`: 3/3.
- **Lanțul fără Docker:** `format:check`, `lint`, `typecheck`, `test`, `i18n:check`, `guards:verify`, `build`, toate exit 0.
