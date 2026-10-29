# AppShell

`component` · Shell · versiunea 1.0.1

The frame of every app: Spine on the left, ContextBar on top, the content (PageHeader + Sheet) in the middle — and a bottom nav under 768px.

## Proprietăți

| prop | tip | obligatorie |
| --- | --- | --- |
| `spine` | `ReactNode` |  |
| `contextBar` | `ReactNode` |  |
| `children` | `ReactNode` |  |
| `height` | `string \| number` |  |

## Evenimente

—

## Stări

- desktopExpanded
- tabletCollapsed
- mobileBottomNav

## Note

README says 640px/1024px; the bundle switches to bottom nav under 768px (container query), so the preview uses 820px for tablet

Mai mult: `components/AppShell/README.md`, exemplele: `components/AppShell/preview.html`.
