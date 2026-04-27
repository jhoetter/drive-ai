import type { ReactNode } from "react";

export function DriveBreadcrumbs(props: {
  segments: { id: string; name: string; type?: string }[];
  renderSegment?: (s: { id: string; name: string; type?: string }, label: ReactNode) => ReactNode;
}): ReactNode {
  return (
    <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 14, flexWrap: "wrap" }}>
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
