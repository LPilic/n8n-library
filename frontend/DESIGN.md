# n8n Library frontend — built on @n8n/design-system

The frontend is a **Vue 3** SPA (Vite + TypeScript + Tailwind CSS v4) that uses
n8n's official component library [`@n8n/design-system`](https://www.npmjs.com/package/@n8n/design-system)
directly: `N8nButton`, `N8nInput`, `N8nSelect`, `N8nBadge`, `N8nCard`, `N8nDialog`,
`N8nIcon` (lucide), and friends.

> **License note:** `@n8n/design-system` is licensed under n8n's Sustainable Use
> License (internal business / non-commercial use; redistribution free of charge
> only). This project is AGPL-3.0. Keep the dependency in mind if you redistribute
> this app commercially — see `node_modules/@n8n/design-system/LICENSE.md`.

## Layering

1. **`@n8n/design-system`** — components, design tokens, Geist fonts.
   Imported in `src/main.ts`:
   - `@n8n/design-system/theme.css` — tokens, reset, `@font-face`, `[data-theme]` dark mode
   - `@n8n/design-system/style.css` — component styles
   - `N8nPlugin` — required for `v-n8n-html` / `v-n8n-truncate` directives
   - `IconBodyLoaderKey` provide — enables the full lucide icon set in `N8nIcon`
2. **`src/index.css`** — Tailwind v4 (`@theme`) mapping the design-system tokens
   to the app's utility classes (`bg-card`, `text-text-muted`, …) plus a few
   layout helpers (mobile breakpoint, sidebar scrollbar, animations).
3. **Shared components** (`src/components/`) — app layout, confirm dialog,
   command palette, rich text editor (TipTap), workflow preview (`n8n-demo` web
   component), node chip flow, icon picker (`lucide-vue-next`), etc.
4. **Features** (`src/features/`) — one `.vue` page per route, ported 1:1 from
   the original React version (`VUE-PATTERNS.md` documents the mapping).

## Theme + branding

- Dark mode: `data-theme` attribute on `<html>` — set by
  `src/stores/theme.ts` (`light | dark | system`), exactly what the design
  system's tokens listen to.
- Branding: `src/stores/branding.ts` overrides the design-system brand token
  (`--background--brand` + hover/active) and light-mode surface tokens inline on
  `<html>`, from `GET /api/settings/branding`. Dark mode always uses design
  system values (inline overrides removed).

## Conventions

- Server state: `@tanstack/vue-query`; local/UI state: Pinia stores.
- All icons via `<N8nIcon icon="<kebab-lucide-name>" />`.
- Modals: `N8nDialog` (content) / `N8nAlertDialog` (confirms).
- See `VUE-PATTERNS.md` for the full component/porting cheatsheet.