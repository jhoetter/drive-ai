import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function NewFolderModal(props: {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation("trans");
  const [name, setName] = useState("");

  useEffect(() => {
    if (props.open) setName("");
  }, [props.open]);

  if (!props.open) return null;

  const submit = async () => {
    const next = name.trim();
    if (!next) return;
    await props.onSubmit(next);
  };

  const busy = props.submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-folder-modal-title"
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
        if (e.target === e.currentTarget && !busy) props.onClose();
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
        <h2 id="new-folder-modal-title" style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600 }}>
          {t("newFolderModalTitle")}
        </h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          aria-label={t("folderNamePlaceholder")}
          placeholder={t("folderNamePlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") {
              e.preventDefault();
              if (!busy) props.onClose();
            }
          }}
          autoFocus
          style={{
            width: "100%",
            boxSizing: "border-box",
            marginBottom: 14,
            borderRadius: "var(--hof-radius-md)",
            border: "1px solid var(--dri-border)",
            padding: "8px 10px",
            fontSize: 14,
            background: "var(--dri-surface-0)",
            color: "var(--dri-text)",
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => props.onClose()}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--hof-radius-lg)",
              border: "1px solid var(--dri-border)",
              background: "var(--dri-surface-1)",
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void submit()}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--hof-radius-lg)",
              border: "1px solid var(--dri-border)",
              background: "var(--dri-surface-0)",
              cursor: busy || !name.trim() ? "not-allowed" : "pointer",
              fontWeight: 600,
            }}
          >
            {t("createFolder")}
          </button>
        </div>
      </div>
    </div>
  );
}
