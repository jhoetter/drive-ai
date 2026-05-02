import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}): React.ReactElement | null {
  const { t } = useTranslation("trans");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, busy, props.onCancel]);

  useEffect(() => {
    if (!props.open) setBusy(false);
  }, [props.open]);

  if (!props.open) return null;

  const run = async () => {
    setBusy(true);
    try {
      await props.onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const confirmBg =
    props.danger === true ? "color-mix(in oklab, var(--dri-kind-pdf-fg) 22%, var(--dri-surface-0))" : "var(--dri-surface-0)";
  const confirmFg =
    props.danger === true ? "color-mix(in oklab, var(--dri-kind-pdf-fg) 78%, var(--dri-text))" : "var(--dri-text)";
  const confirmBorder =
    props.danger === true ? "color-mix(in oklab, var(--dri-kind-pdf-fg) 45%, var(--dri-border))" : "var(--dri-border)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 55,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "color-mix(in oklab, var(--dri-text) 35%, transparent)",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) props.onCancel();
      }}
    >
      <div
        style={{
          width: "min(400px, 100%)",
          borderRadius: "var(--hof-radius-lg)",
          border: "1px solid var(--dri-border)",
          background: "var(--dri-surface-0)",
          padding: "20px",
          boxShadow: "0 12px 40px color-mix(in oklab, var(--dri-text) 18%, transparent)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 600 }}>
          {props.title}
        </h2>
        <p id="confirm-dialog-desc" style={{ margin: "0 0 18px", fontSize: 14, color: "var(--dri-text-muted)", lineHeight: 1.45, whiteSpace: "pre-line" }}>
          {props.description}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => props.onCancel()}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--hof-radius-lg)",
              border: "1px solid var(--dri-border)",
              background: "var(--dri-surface-1)",
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 14,
            }}
          >
            {props.cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--hof-radius-lg)",
              border: `1px solid ${confirmBorder}`,
              background: confirmBg,
              color: confirmFg,
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {busy ? String(t("pleaseWait")) : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
