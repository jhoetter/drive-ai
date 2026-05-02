import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Folder, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { driveApi, type DriveItem } from "../api.js";

export function MoveToFolderModal(props: {
  open: boolean;
  onClose: () => void;
  item: Pick<DriveItem, "id" | "name" | "type"> | null;
  /** drive id → root folder id */
  driveRootById: Map<string, string>;
  /** Fallback when drive is unknown */
  fallbackRootFolderId?: string | null;
  onMoved: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation("trans");
  const [browseId, setBrowseId] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: ["item", props.item?.id],
    queryFn: () => driveApi.item(props.item!.id),
    enabled: props.open && Boolean(props.item?.id),
  });

  const fullItem = detailQ.data?.item ?? null;

  const browseRootId = useMemo(() => {
    const did = fullItem?.driveId;
    if (!did) return props.fallbackRootFolderId ?? null;
    return props.driveRootById.get(did) ?? props.fallbackRootFolderId ?? null;
  }, [fullItem?.driveId, props.driveRootById, props.fallbackRootFolderId]);

  useEffect(() => {
    if (props.open) {
      const start = browseRootId ?? props.fallbackRootFolderId ?? null;
      setBrowseId(start);
    }
  }, [props.open, browseRootId, props.fallbackRootFolderId]);

  const breadcrumbFolderId = browseId ?? browseRootId;
  const breadQ = useQuery({
    queryKey: ["breadcrumb", breadcrumbFolderId],
    queryFn: () => driveApi.breadcrumb(breadcrumbFolderId!),
    enabled: props.open && Boolean(breadcrumbFolderId),
  });

  const childrenQ = useQuery({
    queryKey: ["children", breadcrumbFolderId, "folders-only", "move-picker"],
    queryFn: () =>
      driveApi.children(breadcrumbFolderId!, {
        limit: 200,
        page: 1,
        type: "folder",
      }),
    enabled: props.open && Boolean(breadcrumbFolderId),
  });

  const parentId = useMemo(() => {
    const segs = breadQ.data?.segments;
    if (!segs?.length || segs.length < 2) return null;
    return segs[segs.length - 2]?.id ?? null;
  }, [breadQ.data?.segments]);

  const noopMove =
    fullItem?.parentId != null &&
    breadcrumbFolderId != null &&
    fullItem.parentId === breadcrumbFolderId;
  const canMoveHere =
    Boolean(fullItem) &&
    Boolean(breadcrumbFolderId) &&
    fullItem!.id !== breadcrumbFolderId &&
    !noopMove;

  const doMove = async () => {
    const it = detailQ.data?.item;
    if (!it || !breadcrumbFolderId) return;
    try {
      await driveApi.moveItem(it.id, breadcrumbFolderId);
      props.onMoved();
      props.onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      props.onError(msg);
    }
  };

  if (!props.open || !props.item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "color-mix(in oklab, var(--dri-text) 35%, transparent)",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          maxHeight: "min(70vh, 520px)",
          display: "flex",
          flexDirection: "column",
          borderRadius: "var(--hof-radius-lg)",
          border: "1px solid var(--dri-border)",
          background: "var(--dri-surface-0)",
          boxShadow:
            "0 12px 40px color-mix(in oklab, var(--dri-text) 18%, transparent)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--dri-border)" }}>
          <h2 id="move-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {t("moveItemTitle")}
          </h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--dri-text-muted)" }}>
            {props.item.name}
          </p>
        </div>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--dri-border)", display: "flex", gap: 8 }}>
          <button
            type="button"
            disabled={!parentId}
            onClick={() => parentId && setBrowseId(parentId)}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--hof-radius-md)",
              border: "1px solid var(--dri-border)",
              background: "var(--dri-surface-1)",
              cursor: parentId ? "pointer" : "not-allowed",
              opacity: parentId ? 1 : 0.45,
              fontSize: 13,
            }}
          >
            {t("moveParentFolder")}
          </button>
          <button
            type="button"
            disabled={browseRootId == null}
            onClick={() => browseRootId && setBrowseId(browseRootId)}
            style={{
              padding: "6px 10px",
              borderRadius: "var(--hof-radius-md)",
              border: "1px solid var(--dri-border)",
              background: "var(--dri-surface-1)",
              cursor: browseRootId ? "pointer" : "not-allowed",
              opacity: browseRootId ? 1 : 0.45,
              fontSize: 13,
            }}
          >
            {t("moveDriveRoot")}
          </button>
        </div>
        <div style={{ overflow: "auto", flex: 1, padding: "4px 0" }}>
          {childrenQ.isLoading && (
            <p style={{ padding: "12px 16px", color: "var(--dri-text-muted)", fontSize: 13 }}>{t("moveLoadingFolders")}</p>
          )}
          {childrenQ.isError && (
            <p style={{ padding: "12px 16px", fontSize: 13, color: "var(--dri-text)" }}>
              {childrenQ.error instanceof Error ? childrenQ.error.message : String(childrenQ.error)}
            </p>
          )}
          {childrenQ.data?.items.map(({ item: fi }) =>
            fi.type === "folder" && fi.id !== fullItem?.id ? (
              <button
                key={fi.id}
                type="button"
                onClick={() => setBrowseId(fi.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 16px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 14,
                  color: "var(--dri-text)",
                }}
              >
                <Folder
                  size={16}
                  aria-hidden
                  style={{ flexShrink: 0, color: "var(--dri-kind-folder-fg, var(--dri-primary))" }}
                />
                <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{fi.name}</span>
                <ChevronRight
                  size={16}
                  aria-hidden
                  style={{ flexShrink: 0, color: "var(--dri-text-muted)" }}
                />
              </button>
            ) : null,
          )}
          {childrenQ.data && childrenQ.data.items.filter((x) => x.item.type === "folder" && x.item.id !== fullItem?.id).length === 0 && !childrenQ.isLoading && (
            <p style={{ padding: "12px 16px", color: "var(--dri-text-muted)", fontSize: 13 }}>
              {t("moveNoSubfolders")}
            </p>
          )}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--dri-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={props.onClose}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--hof-radius-md)",
              border: "1px solid var(--dri-border)",
              background: "var(--dri-surface-1)",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            disabled={!canMoveHere || detailQ.isLoading || !fullItem}
            onClick={() => void doMove()}
            style={{
              padding: "8px 14px",
              borderRadius: "var(--hof-radius-md)",
              border: "1px solid var(--dri-border)",
              background: canMoveHere && !detailQ.isLoading && fullItem ? "var(--dri-primary)" : "var(--dri-surface-2)",
              color:
                canMoveHere && !detailQ.isLoading && fullItem
                  ? "var(--dri-primary-fg,white)"
                  : "var(--dri-text-muted)",
              cursor: canMoveHere && !detailQ.isLoading && fullItem ? "pointer" : "not-allowed",
              fontSize: 14,
            }}
          >
            {t("moveHere")}
          </button>
        </div>
      </div>
    </div>
  );
}
