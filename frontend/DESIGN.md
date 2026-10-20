# n8n-style design system

This frontend uses an **n8n-inspired** visual language implemented in React and
Tailwind. It does not import `@n8n/design-system` directly.

## Why not import `@n8n/design-system`?

`@n8n/design-system` is a Vue 3 component library:

- `vue` and `vue-router` are peer dependencies.
- It pulls in Element Plus, Reka UI, TipTap, and several n8n-private packages.
- Its license is n8n's Sustainable Use License, not AGPL.
- It ships compiled Vue components, not a framework-neutral CSS package.

Our frontend is React 18 + Vite + Tailwind. Adding a Vue runtime just for
components would mix frameworks and complicate the build. Instead we reproduce
the design language with our own tokens and primitives.

## Tokens

Tokens live in `src/index.css` under `@theme` and `[data-theme="dark"]`:

| Token | Light | Dark |
|---|---|---|
| `--color-primary` | `#ff6d5a` | `#ff6d5a` |
| `--color-bg` | `#f5f5f5` | `#1a1a1a` |
| `--color-card` | `#ffffff` | `#242424` |
| `--color-border` | `#e0e0e0` | `#3a3a3a` |
| `--color-text-dark` | `#2b2b2b` | `#f0f0f0` |
| `--color-text-base` | `#555555` | `#c9c9c9` |
| `--color-text-muted` | `#7a7a7a` | `#9a9a9a` |
| `--radius-sm` | `4px` | `4px` |
| `--radius-md` | `8px` | `8px` |
| `--radius-lg` | `12px` | `12px` |

Existing Tailwind classes (`bg-card`, `border-border`, `text-text-dark`,
`rounded-sm`, `rounded-md`, etc.) automatically follow these tokens.

## Primitives

Import from `src/components/ui`:

```tsx
import { Button, Input, Textarea, Badge, Card, CardHeader, CardContent,
  Tabs, Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Modal, Switch } from '@/components/ui'
```

Available component classes in `index.css`:

- `.n8n-btn` + `.n8n-btn-primary|secondary|ghost|danger|success`
  + `.n8n-btn-sm|lg`, `.n8n-btn-icon`
- `.n8n-input`, `.n8n-select-trigger`, `.n8n-popover`
- `.n8n-card`, `.n8n-card-header`, `.n8n-card-title`
- `.n8n-badge` + `.n8n-badge-primary|success|warning|danger|info`
- `.n8n-table`
- `.n8n-tabs`, `.n8n-tab`, `.n8n-tab-active`
- `.n8n-modal-overlay`, `.n8n-modal`, `.n8n-modal-header/body/footer`

## Guidance

- Prefer the primitives for new UI.
- Use `13px` for control text, `11px` for uppercase table headers, and
  `12px` for badges and hints.
- Use 4px radius for controls, 8px for cards, 12px for modals.
- Use 1px borders and subtle shadows rather than heavy elevation.
- Keep the coral primary for actions; use neutral surfaces for everything else.
- Do not copy source or assets from `@n8n/design-system`.

## Serving the React frontend

The Docker image sets `FRONTEND=react`. For local development:

```bash
cd frontend
npm run dev
```

For a non-Docker server, build `frontend/dist` first (`npm run build` inside
`frontend/`) and then run `node server.js`.
