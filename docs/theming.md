# Theming drive-ai for a host design system (e.g. hof-os)

The web app layers **three styling surfaces**, all keyed off host `--ds-*` tokens:

1. **`--dri-*` bridge** ([`packages/ui/src/tokens.css`](../packages/ui/src/tokens.css)) — maps semantic roles to `--color-*` fallbacks next-themes / shell expose.
2. **Tailwind v4 `@theme inline`** ([`apps/web/src/index.css`](../apps/web/src/index.css)) — maps utilities such as `bg-background`, `text-muted-foreground`, `border-border`, `rounded-lg`, `bg-hover`, `bg-surface` directly to **`--ds-*`**, matching the presets in [`apps/web/src/design-systems/`](../apps/web/src/design-systems/).
3. **`@layer utilities`** in [`packages/ui/src/drive-shell.css`](../packages/ui/src/drive-shell.css) — shared file-manager row/card classes (`@apply` only; no hex).

## Host overrides (`--ds-*`)

On the host root (or a wrapper around the embedded app), set any of:

| Variable           | Role                            |
|--------------------|---------------------------------|
| `--ds-bg-canvas`   | Default page / app background   |
| `--ds-bg-subtle`   | Secondary surfaces              |
| `--ds-border`      | Hairline borders                |
| `--ds-fg`          | Primary text                    |
| `--ds-fg-muted`    | Secondary text                  |
| `--ds-accent`      | Primary / focus / links         |

Each maps to a `--dri-*` variable with a built-in fallback when unset, for example:

```css
--dri-surface-0: var(--color-background, var(--ds-bg-canvas, #fafafa));
```

Dark mode uses `[data-theme="dark"]` on a parent (e.g. `next-themes`); the same `--ds-*` names apply so the host can scope light/dark however it prefers.

## What to prefer in product code

- Tailwind semantics (`bg-hover`, `text-foreground`, `border-border`) and `dri-*` utility classes from `drive-shell.css` for repeatable layouts (lists, toolbars).
- Reserve **`style={{}}` with `var(--dri-*)`** for one-offs until migrated.

## What to avoid in product code

- Inline hex / `rgb()` in React `style={{}}` for non-debug UI.
- Duplicating brand colors outside the token layer.

New surfaces should extend `tokens.css` with `var(--ds-*, fallback)` **only** when a new semantic is needed.

## Packages

- **`@driveai/ui`** — exports `DriveNavItem`, `DriveListView`, `DriveGridView`, `DriveItemIcon`, etc. File views use Tailwind class names compiled by **`@driveai/web`** (workspace scan includes `packages/ui`).
- **`apps/web`** — imports [`apps/web/src/index.css`](../apps/web/src/index.css) for tokens, `@theme`, and `drive-shell.css`.

See also [gdrive-parity.md](./gdrive-parity.md).
