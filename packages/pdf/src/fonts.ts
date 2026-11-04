import { fileURLToPath } from 'node:url';
import { Font } from '@react-pdf/renderer';

/**
 * Fonturile sistemului de design, ca instanțe statice TTF (Google Fonts, OFL; vezi fonts/OFL.txt).
 * Fișierele variabile WOFF2 din packages/tokens nu merg: react-pdf încorporează doar instanța
 * implicită a unui font variabil. Greutățile sunt cele din scara tipografică (tokens.json).
 */
const FACES = [
  { family: 'DM Sans', fontWeight: 400, file: 'DMSans-Regular.ttf' },
  { family: 'DM Sans', fontWeight: 500, file: 'DMSans-Medium.ttf' },
  { family: 'DM Sans', fontWeight: 600, file: 'DMSans-SemiBold.ttf' },
  { family: 'Syne', fontWeight: 600, file: 'Syne-SemiBold.ttf' },
  { family: 'Syne', fontWeight: 700, file: 'Syne-Bold.ttf' },
] as const;

const fontFile = (name: string) => fileURLToPath(new URL(`../fonts/${name}`, import.meta.url));

let ready: Promise<void> | null = null;

/** Înregistrează și încarcă fonturile o singură dată per proces. */
export function loadPdfFonts(): Promise<void> {
  ready ??= load().catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
}

async function load(): Promise<void> {
  for (const family of new Set(FACES.map((f) => f.family))) {
    Font.register({
      family,
      fonts: FACES.filter((f) => f.family === family).map((f) => ({
        src: fontFile(f.file),
        fontWeight: f.fontWeight,
      })),
    });
  }

  // Despărțirea implicită în silabe e pentru engleză; în celelalte 5 limbi ar rupe greșit cuvintele.
  Font.registerHyphenationCallback((word) => [word]);

  for (const { family, fontWeight } of FACES) {
    const descriptor = { fontFamily: family, fontWeight };
    await Font.load(descriptor);
    const font = Font.getFont(descriptor).data;
    if (!font || !('characterSet' in font))
      throw new Error(`Font neîncărcat: ${family} ${fontWeight}`);

    // fontkit 2.0.4 ține glifele într-un cache și păstrează caracterele de la prima cerere.
    // Componentele glifelor compuse (de ex. „a” din „ă”) se cer fără caractere, iar ToUnicode
    // iese gol: textul extras din PDF pierde litera. Cerem întâi fiecare glifă din cmap cu
    // caracterul ei.
    for (const codePoint of font.characterSet) font.glyphForCodePoint(codePoint);
  }
}
