/** Cheia din localStorage pentru tema aleasă: 'light' | 'dark' | 'auto'. */
export const THEME_STORAGE_KEY = 'vt-theme';

/**
 * Pune tema salvată pe <html> înainte de prima randare, ca pagina să nu clipească.
 * „auto” (sau nimic salvat) = fără atribut: tokens.css urmează prefers-color-scheme.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

/** Se pune în <head>-ul layout-ului rădăcină, o singură dată per aplicație. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
