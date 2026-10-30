# n8n Library frontend — built on @n8n/design-system

The frontend is a **Vue 3** SPA (Vite + TypeScript + Tailwind CSS v4) that uses
n8n's official component library [`@n8n/design-system`](https://www.npmjs.com/package/@n8n/design-system)
directly: `N8nButton`, `N8nInput`, `N8nSelect`, `N8nBadge`, `N8nCard`, `N8nDialog`,
`N8nIcon` (lucide), and friends.

> **License note:** `@n8n/design-system` is licensed under n8n's Sustainable Use
> License (internal business / non-commercial use; redistribution free of charge
> only). This project is AGPL-3.0. Keep the dependency in mind if you redistribute
> this app commercially — see `node_modules/@n8n/design-system/LICENSE.md`.

## Why Tailwind stays (assessed 2026-10)

We evaluated removing Tailwind (plain CSS / utility classes hand-rolled).
Decision: **keep it.** Reasons:

1. **What Tailwind provides here is layout, not design.** The design tokens
   come from the design system; Tailwind only offers layout ergonomics
   (`flex gap-x`, grid columns, padding) with zero runtime and per-page
   dead-code removal. Replacing it means hand-writing ~50 utility patterns
   across 42 SFCs — days of mechanical work for no visual gain.
2. **The painful part is fixed.** The historical pain came from two things
   and both are solved structurally: (a) the design system reset vs. utility
   specificity wars — solved by importing the DS css *after* the preflight
   and *before* utilities, unlayered, in one origin (order + specificity
   then behave conventionally); (b) `space-y-*` zero-specificity margins
   being eaten by margin resets — eliminated by using `gap` everywhere
   instead of margin-based spacing.
3. **Exit cost is one-time low if ever needed:** all colors/typography live
   in a token block (`src/index.css` `@theme`); a future "no-Tailwind" build
   would swap utility classes for a small hand-rolled css layer reusing the
   same tokens. No component change required.

## Layering rules (do not reorder)

`src/index.css` import order is a cascade contract (the bundler strips
`@layer` statements, so order = origin):

1. `tailwindcss/theme.css` (+ app `@theme` tokens)
2. `tailwindcss/preflight.css` — universal reset (`* { margin: 0 … }`)
3. `@n8n/design-system/theme.css` + `style.css` — component styles, so they
   beat the preflight reset (specificity class > universal; later == safe)
4. `tailwindcss/utilities.css` LAST — utilities win ties against DS rules
5. App custom css + `[data-theme]` token overrides after that (custom
   properties, never a conflict with utilities)

## Theme + branding

- Dark mode: `data-theme` attribute on `<html>` **and `<body>`** — the body
  attribute is what keeps the design system's OS-fallback blocks
  (`body:not([data-theme])` under `prefers-color-scheme`) from applying.
  Set by `src/stores/theme.ts`; tokens flip via the `[data-theme]` blocks in
  `index.css` plus re-declarations of the design system's OS-guarded
  component tokens (extracted 1:1; see the "Component tokens" block).
- Branding: `src/stores/branding.ts` overrides brand + surface tokens
  inline on `<html>` from `GET /api/settings/branding`; empty settings
  leave the design system palette untouched.

## Conventions

- Server state: `@tanstack/vue-query`; local/UI state: Pinia stores.
- All icons via `<N8nIcon icon="<kebab-lucide-name>" />`.
- Modals: `N8nDialog` (content) / `N8nAlertDialog` (confirms).
- **Spacing: `flex flex-col gap-*` or grid gaps only — never margin-based
  stacks (`space-y` is banned); rows: `px-4 py-2.5`; cards: `p-5` (20px,
  via `--card--padding`); titles: page = `N8nHeading size="xlarge"`,
  section = `medium`; meta text floor = 11px.**
- See `VUE-PATTERNS.md` for the component/porting cheatsheet.