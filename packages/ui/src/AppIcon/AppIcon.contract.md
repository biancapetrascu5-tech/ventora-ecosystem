# AppIcon

One of the 15 Ventora app icons — `<img>` pointing to the SVG from `/app-icons/`.

**Props.** `app` (AppName), `size` (number, default 44), `muted` (inactive variant), `dark` (dark theme variant — pass explicitly), `title` (accessible name; omit when the app name is adjacent), `basePath` (default `/app-icons/`).

**Status.** CONFIRMAT — demo implementation. Full implementation (inline SVG, CSS token coloring) is in Lot 7.

**NECESITĂ DECIZIE FONDATORI.** Lot 7 va înlocui `<img>` cu SVG inline pentru ca tokenii `--appicon-*` să controleze culorile dinamic, fără variante separate per temă.
