# Theming drive-ai for a host design system (e.g. hof-os)

The web app and `@driveai/ui` use **CSS variables** as the only styling contract. Product code should **not** hardcode hex colors; it uses `var(--dri-*)` tokens defined in [`packages/ui/src/tokens.css`](../packages/ui/src/tokens.css).

## Host overrides (`--ds-*`)

On the host root (or a wrapper around the embedded app), set any of:

| Variable | Role |
|----------|------|
| `--ds-bg-canvas` | Default page / app background |
| `--ds-bg-subtle` | Secondary surfaces (sidebars, chips) |
| `--ds-border` | Hairline borders |
| `--ds-fg` | Primary text |
| `--ds-fg-muted` | Secondary text |
| `--ds-accent` | Primary / focus / links |

Each maps to a `--dri-*` variable with a built-in fallback when unset, for example:

```css
--dri-surface-0: var(--ds-bg-canvas, #fafafa);
```

Dark mode uses `[data-theme="dark"]` on a parent (e.g. `next-themes`); the same `--ds-*` names apply so the host can scope light/dark however it prefers.

## What to avoid in product code

- Inline hex / `rgb()` in React `style={{}}` for non-debug UI
- Duplicating brand colors outside the token layer

New surfaces should extend `tokens.css` with `var(--ds-*, fallback)` **only** when a new semantic is needed (e.g. elevated surface), not to copy a one-off marketing color.

## Packages

- **`@driveai/ui`**: exports shell pieces (`DriveNavItem`, `DriveListView`, …) that read `var(--dri-*)` only.
- **`apps/web`**: imports `tokens.css` via [`apps/web/src/index.css`](../apps/web/src/index.css) and sets `font-family` on `body`; the host can override `font-family` on `#root` or the wrapper if needed.

See also [gdrive-parity.md](./gdrive-parity.md) for product behavior vs. Google Drive (not visual parity).
