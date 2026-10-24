# LanguageSwitcher

Choose the interface language; each language is named in itself (Română, English, Français, Español, Deutsch).

**Props.** `value` / `onChange(code)` (`ro`, `en`, `fr`, `es`, `de`), `variant` (`button` shows the current name, `icon` a globe), `placement`. Wrap the app in `VentoraProvider locale={code}` so built-in strings (pagination, date names, empty texts, "Anulează") switch with it.
