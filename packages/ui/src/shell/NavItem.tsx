import type { ReactNode } from "react";

/**
 * Left-rail nav link with token-based active state for design-system hosts (`--dri-*` / `--ds-*`).
 */
export function DriveNavItem(props: { to: string; active: boolean; children: ReactNode }) {
  return (
    <a
      href={props.to}
      aria-current={props.active ? "page" : undefined}
      style={{
        display: "block",
        padding: "8px 12px",
        borderRadius: "var(--dri-radius)",
        textDecoration: "none",
        color: "var(--dri-text)",
        background: props.active ? "var(--dri-surface-1)" : "transparent",
        borderLeft: props.active ? "3px solid var(--dri-primary)" : "3px solid transparent",
        fontWeight: props.active ? 600 : 400,
        outline: "none",
      }}
    >
      {props.children}
    </a>
  );
}
