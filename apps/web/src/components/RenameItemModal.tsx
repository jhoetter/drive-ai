import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { driveApi, type DriveItem } from "../api.js";

export function RenameItemModal(props: {
  open: boolean;
  onClose: () => void;
  item: Pick<DriveItem, "id" | "name" | "type"> | null;
  onRenamed: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation("trans");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.open && props.item) {
      setName(props.item.name);
    }
  }, [props.open, props.item]);

  if (!props.open || !props.item) return null;

  const submit = async () => {
    const next = name.trim();
    if (!next || next === props.item!.name) {
      props.onClose();
      return;
    }
    setBusy(true);
    try {
      await driveApi.renameItem(props.item!.id, next);
      props.onRenamed();
      props.onClose();
    } catch (e) {
      props.onError(e instanceof Error ? e.message : String(e ?? ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-modal-title"
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
        <h2 id="rename-modal-title" style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 600 }}>
          {t("renameItemTitle")}
        </h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={busy}
          aria-label={t("renamePlaceholder")}
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
            {t("renameSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
