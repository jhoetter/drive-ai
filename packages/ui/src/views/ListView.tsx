import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Download, FolderInput, MoreVertical, Pencil, Star, Trash2 } from "lucide-react";
import { DriveItemIcon } from "../icons/DriveItemIcon.js";
import { driveIconKind } from "../icons/driveIconKind.js";

/** Pre-formatted row for filesystem table + keyboard nav. */
export type DriveListDisplayRow = {
  id: string;
  name: string;
  /** file | folder | … */
  type: string;
  mime?: string | null;
  snippet?: string | null;
  locationPath?: string | null;
  sizeLabel: string;
  modifiedLabel: string;
  kindLabel: string;
  starred?: boolean;
};

export type DriveListSortKey = "name" | "modified" | "size";
export type DriveListSortDir = "asc" | "desc";

/** Custom DataTransfer MIME for reorder/moves inside the list (avoid colliding with OS file drops). */
export const DRIVEAI_ITEM_DRAG_MIME = "application/vnd.driveai.item+json";

export function parseDriveListDragPayload(dataTransfer: DataTransfer): {
  id: string;
  type: string;
} | null {
  try {
    let raw = dataTransfer.getData(DRIVEAI_ITEM_DRAG_MIME);
    if (!raw) raw = dataTransfer.getData("text/plain");
    if (!raw?.trimStart().startsWith("{")) return null;
    const j = JSON.parse(raw) as { id?: string; type?: string };
    if (!j?.id || (j.type !== "file" && j.type !== "folder")) return null;
    return { id: j.id, type: j.type };
  } catch {
    return null;
  }
}

function sortAria(sort: DriveListSortKey | undefined, key: DriveListSortKey, dir: DriveListSortDir) {
  if (!sort || sort !== key) return "none" as const;
  return dir === "asc" ? ("ascending" as const) : ("descending" as const);
}

/** Row-overflow menu anchored to ⋮ trigger (ported to avoid clipping inside scroll containers). */
function DriveRowActionsPortal(props: {
  row: DriveListDisplayRow;
  anchorEl: HTMLButtonElement;
  columnLabels: {
    download?: string;
    move?: string;
    rename?: string;
    moveToTrash?: string;
    rowActionsMenu?: string;
  };
  onClose: () => void;
  onDownload?: (row: DriveListDisplayRow) => void;
  onMove?: (row: DriveListDisplayRow) => void;
  onRename?: (row: DriveListDisplayRow) => void;
  onTrash?: (row: DriveListDisplayRow) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState({ top: 0, left: 0, width: 200 });

  useLayoutEffect(() => {
    const r = props.anchorEl.getBoundingClientRect();
    const menuWidth = Math.min(220, Math.max(168, Math.floor(window.innerWidth * 0.42)));
    let left = Math.round(r.right - menuWidth);
    left = Math.max(10, Math.min(left, window.innerWidth - menuWidth - 10));
    let top = r.bottom + 6;
    const estH = Math.min(menuRef.current?.offsetHeight ?? 230, Math.floor(window.innerHeight * 0.55));
    if (top + estH > window.innerHeight - 8) {
      top = Math.max(8, r.top - estH - 6);
    }
    setSlot({ top, left, width: menuWidth });
  }, [props.anchorEl, props.row.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  useEffect(() => {
    const anchorEl = props.anchorEl;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (anchorEl.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      props.onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [props.anchorEl, props.onClose]);

  const showDownload = props.onDownload != null && props.row.type === "file";
  const showMove = props.onMove != null && (props.row.type === "file" || props.row.type === "folder");
  const showRename = props.onRename != null && (props.row.type === "file" || props.row.type === "folder");
  const showTrash = props.onTrash != null && (props.row.type === "file" || props.row.type === "folder");

  return createPortal(
    <div
      ref={menuRef}
      id={`dri-drive-row-menu-${props.row.id}`}
      role="menu"
      aria-label={props.columnLabels.rowActionsMenu ?? "Actions"}
      className="dri-drive-row-menu-popover"
      style={{
        position: "fixed",
        top: slot.top,
        left: slot.left,
        width: slot.width,
        zIndex: 100,
        maxHeight: "min(280px, calc(100vh - 24px))",
        overflowY: "auto",
        borderRadius: "var(--dri-radius)",
        border: "1px solid var(--dri-border)",
        background: "var(--dri-surface-0)",
        boxShadow: "0 10px 28px color-mix(in oklab, var(--dri-text) 16%, transparent)",
        padding: "4px",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
        {showDownload ? (
          <button
            type="button"
            role="menuitem"
            className="dri-drive-row-menu-item"
            onClick={() => {
              props.onClose();
              props.onDownload!(props.row);
            }}
          >
            <Download aria-hidden size={16} strokeWidth={2} className="dri-drive-row-menu-item-icon" />
            <span>{props.columnLabels.download ?? "Download"}</span>
          </button>
        ) : null}
        {showMove ? (
          <button
            type="button"
            role="menuitem"
            className="dri-drive-row-menu-item"
            onClick={() => {
              props.onClose();
              props.onMove!(props.row);
            }}
          >
            <FolderInput aria-hidden size={16} strokeWidth={2} className="dri-drive-row-menu-item-icon" />
            <span>{props.columnLabels.move ?? "Move"}</span>
          </button>
        ) : null}
        {showRename ? (
          <button
            type="button"
            role="menuitem"
            className="dri-drive-row-menu-item"
            onClick={() => {
              props.onClose();
              props.onRename!(props.row);
            }}
          >
            <Pencil aria-hidden size={16} strokeWidth={2} className="dri-drive-row-menu-item-icon" />
            <span>{props.columnLabels.rename ?? "Rename"}</span>
          </button>
        ) : null}
        {showTrash ? (
          <button
            type="button"
            role="menuitem"
            className="dri-drive-row-menu-item dri-drive-row-menu-item--danger"
            onClick={() => {
              props.onClose();
              props.onTrash!(props.row);
            }}
          >
            <Trash2 aria-hidden size={16} strokeWidth={2} className="dri-drive-row-menu-item-icon" />
            <span>{props.columnLabels.moveToTrash ?? "Move to trash"}</span>
          </button>
        ) : null}
      </div>,
    document.body,
  );
}

export function DriveListView(props: {
  ariaLabel?: string;
  columnLabels: {
    name: string;
    modified: string;
    size: string;
    starAriaAdd: string;
    starAriaRemove: string;
    /** Column heading for ⋮ menus */
    actions?: string;
    download?: string;
    move?: string;
    rename?: string;
    moveToTrash?: string;
    /** aria-label for ⋮ triggers */
    rowActionsMenu?: string;
  };
  rows: readonly DriveListDisplayRow[];
  /** When set: files select on single-click; folders open on single-click; Enter / file double-click opens. When unset: single-click opens. */
  selectedId?: string | null;
  onRowSelect?: (row: DriveListDisplayRow) => void;
  onRowOpen?: (row: DriveListDisplayRow) => void;
  onToggleStar?: (row: DriveListDisplayRow, nextStarred: boolean) => void | Promise<void>;
  sort?: { key: DriveListSortKey; dir: DriveListSortDir };
  onSortChange?: (key: DriveListSortKey) => void;
  /** When true, ⋮ opens download / move / rename / trash (only handlers you pass are shown). */
  showRowActionsMenu?: boolean;
  onRowDownload?: (row: DriveListDisplayRow) => void;
  onRowMove?: (row: DriveListDisplayRow) => void;
  onRowRename?: (row: DriveListDisplayRow) => void;
  onRowTrash?: (row: DriveListDisplayRow) => void;
  /** Drag a row onto another row with type folder to move (navigator must allow). */
  onDragMoveToFolder?: (
    dragged: Pick<DriveListDisplayRow, "id" | "type" | "name">,
    targetFolderId: string,
  ) => void | Promise<void>;
  onClearSelection?: () => void;
}): ReactNode {
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuForRowId, setMenuForRowId] = useState<string | null>(null);
  const [dropHoverFolderId, setDropHoverFolderId] = useState<string | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const skipRowClickAfterDragRef = useRef(false);
  const menuTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectionMode = Boolean(props.onRowSelect);
  const dragIntoFolderEnabled = typeof props.onDragMoveToFolder === "function";
  const hasActions = Boolean(
    props.showRowActionsMenu &&
      (props.onRowDownload || props.onRowMove || props.onRowRename || props.onRowTrash),
  );
  const hasStar = Boolean(props.onToggleStar);
  const colCount = (hasStar ? 1 : 0) + 1 + (hasActions ? 1 : 0) + 3;

  const menuRowAndAnchor = useMemo(() => {
    if (!menuForRowId) return null;
    const row = props.rows.find((r) => r.id === menuForRowId);
    const anchor = menuTriggerRefs.current.get(menuForRowId) ?? null;
    if (!row || !anchor) return null;
    return { row, anchor };
  }, [menuForRowId, props.rows]);

  const rowIds = props.rows.map((r) => r.id).join("|");
  useEffect(() => {
    const len = props.rows.length;
    if (len === 0) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((i) => Math.min(Math.max(0, i), len - 1));
  }, [rowIds, props.rows.length]);

  useEffect(() => {
    setMenuForRowId((open) => (open != null && !props.rows.some((r) => r.id === open) ? null : open));
  }, [props.rows, rowIds]);

  const openAt = useCallback(
    (i: number) => {
      const rw = props.rows[i];
      if (rw) props.onRowOpen?.(rw);
    },
    [props.onRowOpen, props.rows],
  );

  const onGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (props.rows.length === 0) return;
    const max = props.rows.length - 1;
    if (menuForRowId) return;
    if (e.key === "Escape" && props.onClearSelection && props.selectedId) {
      e.preventDefault();
      props.onClearSelection();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(max, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(max);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!props.onRowOpen) return;
      openAt(activeIndex);
    }
  };

  if (props.rows.length === 0) return null;

  const renderSortHeader = (key: DriveListSortKey, label: string, className: string) => {
    const active = props.sort?.key === key;
    const dir = props.sort?.dir ?? "asc";
    return (
      <div role="columnheader" className={className} aria-sort={sortAria(props.sort?.key, key, dir)}>
        {props.onSortChange ? (
          <button
            type="button"
            className="dri-drive-sort-header-btn"
            onClick={() => props.onSortChange!(key)}
          >
            <span>{label}</span>
            {active ? (
              dir === "asc" ? (
                <ArrowUp aria-hidden size={12} strokeWidth={2.5} />
              ) : (
                <ArrowDown aria-hidden size={12} strokeWidth={2.5} />
              )
            ) : null}
          </button>
        ) : (
          label
        )}
      </div>
    );
  };

  const activeRow = props.rows[activeIndex];
  const activeDescendant = activeRow ? `${baseId}-${activeRow.id}` : undefined;

  return (
    <>
      {menuRowAndAnchor ? (
        <DriveRowActionsPortal
          row={menuRowAndAnchor.row}
          anchorEl={menuRowAndAnchor.anchor}
          columnLabels={props.columnLabels}
          onClose={() => setMenuForRowId(null)}
          onDownload={props.onRowDownload}
          onMove={props.onRowMove}
          onRename={props.onRowRename}
          onTrash={props.onRowTrash}
        />
      ) : null}
      <div
        className="dri-drive-grid"
        role="grid"
        tabIndex={menuForRowId ? -1 : 0}
        aria-label={props.ariaLabel}
        aria-rowcount={props.rows.length}
        aria-colcount={colCount}
        aria-activedescendant={menuForRowId ? undefined : activeDescendant}
        onKeyDown={onGridKeyDown}
        onDragEnd={() => {
          setDraggingRowId(null);
          setDropHoverFolderId(null);
          skipRowClickAfterDragRef.current = true;
          window.setTimeout(() => {
            skipRowClickAfterDragRef.current = false;
          }, 150);
        }}
      >
        <div role="row" className="dri-drive-header-row">
          {hasStar ? <div className="dri-drive-star-col" aria-hidden /> : null}
          <div className="dri-drive-icon-wrap invisible pointer-events-none" aria-hidden />
          {renderSortHeader("name", props.columnLabels.name, "dri-drive-name-col")}
          {renderSortHeader("modified", props.columnLabels.modified, "dri-drive-meta-col-wide")}
          {renderSortHeader("size", props.columnLabels.size, "dri-drive-meta-col")}
          {hasActions ? (
            <div
              role="columnheader"
              aria-label={props.columnLabels.actions ?? "Actions"}
              className="dri-drive-actions-col dri-drive-actions-col-head dri-drive-actions-col--labeled"
            >
              <span className="dri-drive-actions-head-text" aria-hidden>
                ⋮
              </span>
            </div>
          ) : null}
        </div>
        {props.rows.map((r, i) => {
          const rowId = `${baseId}-${r.id}`;
          const keyboardActive = i === activeIndex;
          const rowSelected =
            props.selectedId != null &&
            props.selectedId !== undefined &&
            props.selectedId !== "" &&
            props.selectedId === r.id;
          const menuOpenThis = menuForRowId === r.id;
          const draggableRow =
            dragIntoFolderEnabled && (r.type === "file" || r.type === "folder");
          const folderDropZone = dragIntoFolderEnabled && r.type === "folder";
          const rowDragging = draggingRowId === r.id;
          const folderDragOver = folderDropZone && dropHoverFolderId === r.id;
          return (
            <div
              key={r.id}
              id={rowId}
              role="row"
              aria-selected={Boolean(rowSelected)}
              draggable={draggableRow ? true : undefined}
              aria-grabbed={rowDragging ? true : undefined}
              className={`dri-drive-row dri-drive-row-focus ${keyboardActive ? "dri-drive-row-active" : ""} ${rowSelected ? "dri-drive-row-selected" : ""} ${folderDragOver ? "dri-drive-row--drag-over-folder" : ""} ${rowDragging ? "dri-drive-row--drag-source" : ""}`}
              style={dragIntoFolderEnabled && draggableRow ? { cursor: "grab" as const } : undefined}
              onDragStart={(e) => {
                if (!dragIntoFolderEnabled || !draggableRow) return;
                const el = e.target as HTMLElement | null;
                if (el?.closest?.("button, a[href]")) {
                  e.preventDefault();
                  return;
                }
                const payload = JSON.stringify({ id: r.id, type: r.type, name: r.name });
                e.dataTransfer.setData(DRIVEAI_ITEM_DRAG_MIME, payload);
                e.dataTransfer.setData("text/plain", payload);
                e.dataTransfer.effectAllowed = "move";
                setDraggingRowId(r.id);
              }}
              onDragOver={
                folderDropZone
                  ? (e) => {
                      const typesList = [...e.dataTransfer.types];
                      const mime = typesList.includes(DRIVEAI_ITEM_DRAG_MIME);
                      if (!mime && draggingRowId == null) return;
                      if (draggingRowId === r.id) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDropHoverFolderId(r.id);
                    }
                  : undefined
              }
              onDragLeave={
                folderDropZone
                  ? (e) => {
                      const cur = e.currentTarget;
                      const rel = e.relatedTarget as Node | null;
                      if (rel && cur.contains(rel)) return;
                      setDropHoverFolderId((hid) => (hid === r.id ? null : hid));
                    }
                  : undefined
              }
              onDrop={
                folderDropZone
                  ? (e) => {
                      const incoming = parseDriveListDragPayload(e.dataTransfer);
                      if (!incoming || incoming.id === r.id) {
                        setDropHoverFolderId(null);
                        return;
                      }
                      e.preventDefault();
                      e.stopPropagation();
                      setDropHoverFolderId(null);
                      setDraggingRowId(null);
                      const draggedRow =
                        incoming.id !== r.id
                          ? props.rows.find((row) => row.id === incoming.id)
                          : undefined;
                      void Promise.resolve(
                        props.onDragMoveToFolder?.(
                          draggedRow ??
                            ({
                              id: incoming.id,
                              type: incoming.type,
                              name: "",
                            } as Pick<DriveListDisplayRow, "id" | "type" | "name">),
                          r.id,
                        ),
                      ).catch(() => {
                        /* parent surfaces uploadError banner */
                      });
                    }
                  : undefined
              }
              onClick={() => {
                if (skipRowClickAfterDragRef.current) return;
                setActiveIndex(i);
                if (!selectionMode) {
                  props.onRowOpen?.(r);
                  return;
                }
                if (r.type === "folder") {
                  props.onRowOpen?.(r);
                  return;
                }
                props.onRowSelect?.(r);
              }}
              onDoubleClick={(ev) => {
                if (skipRowClickAfterDragRef.current) return;
                if (!selectionMode || r.type === "folder") return;
                ev.preventDefault();
                props.onRowOpen?.(r);
              }}
            >
              {hasStar ? (
                <div className="dri-drive-star-col" role="gridcell">
                  <button
                    draggable={false}
                    type="button"
                    className={`dri-drive-star-btn ${r.starred ? "dri-drive-star-btn--active" : ""}`}
                    aria-label={r.starred ? props.columnLabels.starAriaRemove : props.columnLabels.starAriaAdd}
                    aria-pressed={r.starred ?? false}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = !r.starred;
                      void Promise.resolve(props.onToggleStar!(r, next)).catch(() => {
                        /* rejection surfaced by parent setUploadError */
                      });
                    }}
                  >
                    <Star
                      aria-hidden
                      size={15}
                      strokeWidth={r.starred ? 1.25 : 2}
                      fill={r.starred ? "currentColor" : "none"}
                    />
                  </button>
                </div>
              ) : null}
              <div
                role="gridcell"
                className={`dri-drive-icon-wrap dri-drive-icon-wrap--${driveIconKind(r)}`}
              >
                <DriveItemIcon name={r.name} type={r.type} mime={r.mime} size="sm" />
              </div>
              <div className="dri-drive-name-col" role="gridcell">
                <div className="dri-drive-name-primary">{r.name}</div>
                {r.snippet ? (
                  <p className="dri-drive-name-secondary">{r.snippet}</p>
                ) : r.locationPath ? (
                  <p className="dri-drive-name-secondary">{r.locationPath}</p>
                ) : null}
              </div>
              <div className="dri-drive-meta-col-wide dri-drive-meta-cell" role="gridcell">
                {r.modifiedLabel}
              </div>
              <div className="dri-drive-meta-col dri-drive-meta-cell" role="gridcell">
                {r.sizeLabel}
              </div>
              {hasActions ? (
                <div
                  className="dri-drive-actions-col dri-drive-actions-menu-cell"
                  role="gridcell"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    draggable={false}
                    ref={(el) => {
                      if (el) menuTriggerRefs.current.set(r.id, el);
                      else menuTriggerRefs.current.delete(r.id);
                    }}
                    type="button"
                    className="dri-drive-row-menu-trigger"
                    aria-label={props.columnLabels.rowActionsMenu ?? "Row actions"}
                    aria-expanded={menuOpenThis}
                    aria-haspopup="menu"
                    aria-controls={menuOpenThis ? `dri-drive-row-menu-${r.id}` : undefined}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuForRowId((cur) => (cur === r.id ? null : r.id));
                      setActiveIndex(i);
                    }}
                  >
                    <MoreVertical aria-hidden size={17} strokeWidth={2} />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}
