import type { ReactNode } from "react";

export function DriveListView(props: {
  columnHeaders?: { name: string; type: string };
  rows: {
    id: string;
    name: string;
    type: string;
    size?: number | null;
    snippet?: string | null;
    locationPath?: string | null;
  }[];
  onRowOpen?: (row: {
    id: string;
    name: string;
    type: string;
    size?: number | null;
    snippet?: string | null;
    locationPath?: string | null;
  }) => void;
}): ReactNode {
  return (
    <div>
      {props.columnHeaders ? (
        <div
          role="row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            padding: "6px 12px 8px 12px",
            borderBottom: "1px solid var(--dri-border)",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--dri-text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.02em",
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{props.columnHeaders.name}</span>
          <span style={{ flexShrink: 0 }}>{props.columnHeaders.type}</span>
        </div>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {props.rows.map((r) => (
        <li
          key={r.id}
          role={props.onRowOpen ? "button" : undefined}
          onClick={() => props.onRowOpen?.(r)}
          onKeyDown={(e) => {
            if (props.onRowOpen && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              props.onRowOpen(r);
            }
          }}
          style={{
            padding: "8px 12px",
            borderBottom: "1px solid var(--dri-border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 4,
            outlineOffset: 2,
            cursor: props.onRowOpen ? "pointer" : undefined,
          }}
          tabIndex={0}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <span style={{ color: "var(--dri-text)" }}>{r.name}</span>
            <span style={{ color: "var(--dri-text-muted)", fontSize: 12 }}>{r.type}</span>
          </div>
          {r.locationPath ? (
            <p
              style={{
                color: "var(--dri-text-muted)",
                fontSize: 12,
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {r.locationPath}
            </p>
          ) : null}
          {r.snippet ? (
            <p
              style={{
                color: "var(--dri-text-muted)",
                fontSize: 13,
                margin: 0,
                lineHeight: 1.35,
              }}
            >
              {r.snippet}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
    </div>
  );
}
