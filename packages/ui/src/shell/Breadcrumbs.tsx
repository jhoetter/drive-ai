import type { ReactNode } from "react";

export function DriveBreadcrumbs(props: {
  segments: { id: string; name: string; type?: string }[];
  renderSegment?: (s: { id: string; name: string; type?: string }, label: ReactNode) => ReactNode;
  /** Dense header row inside file shell */
  compact?: boolean;
}): ReactNode {
  const compact = Boolean(props.compact);
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        gap: compact ? 5 : 6,
        fontSize: compact ? 13 : 14,
        flexWrap: "wrap",
        lineHeight: 1.3,
      }}
    >
      {props.segments.map((s, i) => {
        const label = <span style={{ color: "var(--dri-text)" }}>{s.name}</span>;
        const inner = props.renderSegment ? props.renderSegment(s, label) : label;
        return (
          <span key={s.id} style={{ color: "var(--dri-text-muted)" }}>
            {i > 0 ? " / " : null}
            {inner}
          </span>
        );
      })}
    </nav>
  );
}
