# AppShell

The frame of every app: Spine on the left, ContextBar on top, the content (PageHeader + Sheet) in the middle — and a bottom nav under 640px.

**Props.** `spine` (a Spine), `contextBar` (a ContextBar), `children` (the page), `height` (defaults to `100vh`).

**Responsive by its own width** (container queries): over 1024px the Spine is expanded; 640–1024px it collapses to icons and the search shrinks to an icon; under 640px the Spine becomes the bottom nav, the ContextBar shows the app name, the Create button becomes a round icon, Sheets go edge to edge.

**One title per screen.** Inside an app the Spine names the app and the PageHeader names the page; the ContextBar shows the business instead of a title.
