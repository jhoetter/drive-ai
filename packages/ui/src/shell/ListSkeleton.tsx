import type { ReactNode } from "react";

/** Token-only loading placeholders (no product-specific styling). */
export function DriveListSkeleton(props: { rows?: number; className?: string }): ReactNode {
  const n = Math.max(2, Math.min(8, props.rows ?? 5));
  return (
    <div
      className={props.className}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
      role="status"
      aria-busy
      aria-label="Loading"
    >
      {Array.from({ length: n }, (_, i) => (
        <div
          key={`sk-${i}`}
          style={{
            height: 40,
            borderRadius: "var(--dri-radius)",
            background: "var(--dri-surface-1)",
            border: "1px solid var(--dri-border)",
            opacity: 0.9,
          }}
        />
      ))}
    </div>
  );
}
