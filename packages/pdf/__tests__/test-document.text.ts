import type { Locale } from '@ventora/i18n';

export interface TestDocumentText {
  eyebrow: string;
  title: string;
  heading: string;
  body: string;
  characters: string;
  caption: string;
}

/** Textele documentului de test, cu diacriticele fiecărei limbi. Doar pentru test. */
export const TEST_DOCUMENT_TEXT: Record<Locale, TestDocumentText> = {
  ro: {
    eyebrow: 'Ventora',
    title: 'Document de test în română',
    heading: 'Șase limbi, aceleași fonturi',
    body: 'Fișierul ăsta verifică încorporarea fonturilor și păstrarea diacriticelor într-un PDF generat pe server.',
    characters: 'ă â î ș ț Ă Â Î Ș Ț',
    caption: 'Generat în limba destinatarului.',
  },
  en: {
    eyebrow: 'Ventora',
    title: 'Test document in English',
    heading: 'Six languages, the same fonts',
    body: 'This file checks that the fonts are embedded and every character survives in a PDF generated on the server.',
    characters: '“Quotes” – dashes — and € 1,250.00',
    caption: 'Generated in the recipient’s language.',
  },
  fr: {
    eyebrow: 'Ventora',
    title: 'Document de test en français',
    heading: 'Six langues, les mêmes polices',
    body: 'Ce fichier vérifie que les polices sont intégrées et que les caractères accentués sont conservés.',
    characters: 'à â ç é è ê ë î ï ô œ ù û ü « Œuvre »',
    caption: 'Généré dans la langue du destinataire.',
  },
  es: {
    eyebrow: 'Ventora',
    title: 'Documento de prueba en español',
    heading: '¿Seis idiomas? ¡Las mismas fuentes!',
    body: 'Este archivo comprueba que las fuentes están incrustadas y que se conservan los acentos y la eñe.',
    characters: 'á é í ó ú ñ ü Á É Í Ó Ú Ñ',
    caption: 'Generado en el idioma del destinatario.',
  },
  de: {
    eyebrow: 'Ventora',
    title: 'Testdokument auf Deutsch',
    heading: 'Sechs Sprachen, dieselben Schriften',
    body: 'Diese Datei prüft, dass die Schriften eingebettet sind und Umlaute sowie das ß erhalten bleiben.',
    characters: 'ä ö ü ß Ä Ö Ü „Größe“',
    caption: 'In der Sprache des Empfängers erstellt.',
  },
  it: {
    eyebrow: 'Ventora',
    title: 'Documento di prova in italiano',
    heading: 'Sei lingue, gli stessi caratteri',
    body: 'Questo file verifica che i caratteri siano incorporati e che le lettere accentate restino intatte.',
    characters: 'à è é ì ò ù À È É Ì Ò Ù',
    caption: 'Generato nella lingua del destinatario.',
  },
};
