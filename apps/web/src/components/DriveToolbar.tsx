import { type KeyboardEventHandler, type CSSProperties, type ReactElement } from "react";
import type { NavigateFunction } from "react-router";
import { useTranslation } from "react-i18next";
import { Command, FolderPlus, LayoutGrid, List } from "lucide-react";

type PaletteOpen = () => void;

export function DriveToolbar(props: {
  qLocal: string;
  setQLocal: (next: string) => void;
  onSearchKeyDown: KeyboardEventHandler<HTMLInputElement>;
  preview: string | null;
  nav: NavigateFunction;
  canScopeSearchToFolder: boolean;
  effectiveFolderId: string | undefined;
  canUpload: boolean;
  uploading: boolean;
  folderCreating: boolean;
  newFolderOpen: boolean;
  setNewFolderOpen: (open: boolean) => void;
  newFolderName: string;
  setNewFolderName: (next: string) => void;
  setUploadError: (msg: string | null) => void;
  submitNewFolder: () => Promise<void>;
  viewMode: string;
  view: "list" | "grid";
  setView: (mode: "list" | "grid") => void;
  onOpenPalette: PaletteOpen;
}): ReactElement {
  const { t } = useTranslation("trans");

  const toolbarActionBtn: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid var(--dri-border)",
    borderRadius: 8,
    padding: "6px 10px",
    background: "var(--dri-surface-1)",
    cursor: "pointer",
    color: "var(--dri-text-muted)",
    fontSize: 13,
  };

  const toolbarFolderInputStyle: CSSProperties = {
    minWidth: 140,
    maxWidth: 220,
    borderRadius: 6,
    border: "1px solid var(--dri-border)",
    padding: "6px 8px",
    fontSize: 14,
    background: "var(--dri-surface-0)",
    color: "var(--dri-text)",
  };

  const searchInFolderStyle: CSSProperties = {
    ...toolbarActionBtn,
    whiteSpace: "nowrap",
  };

  const headerChrome: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    padding: "8px 16px",
    borderBottom: "1px solid var(--dri-border)",
    flexShrink: 0,
  };

  const searchInputStyle: CSSProperties = {
    width: "100%",
    minWidth: 0,
    borderRadius: 6,
    border: "1px solid var(--dri-border)",
    padding: 8,
  };

  return (
    <header style={headerChrome}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
        <input
          data-testid="topbar-search"
          value={props.qLocal}
          onChange={(e) => props.setQLocal(e.target.value)}
          onKeyDown={props.onSearchKeyDown}
          placeholder={String(t("searchPlaceholder"))}
          aria-label={String(t("searchHint"))}
          style={searchInputStyle}
        />
      </div>
      {props.canScopeSearchToFolder && (
        <button
          type="button"
          onClick={() => {
            const par = new URLSearchParams();
            par.set("folderId", props.effectiveFolderId!);
            if (props.qLocal.trim()) par.set("q", props.qLocal.trim());
            void props.nav({ pathname: "/drive/search", search: par.toString() });
          }}
          style={searchInFolderStyle}
        >
          {t("searchInFolder")}
        </button>
      )}
      {props.canUpload &&
        (!props.newFolderOpen ? (
          <button
            type="button"
            onClick={() => {
              props.setUploadError(null);
              props.setNewFolderOpen(true);
            }}
            disabled={props.uploading || props.folderCreating}
            style={{ ...toolbarActionBtn, whiteSpace: "nowrap" }}
          >
            <FolderPlus size={16} aria-hidden />
            {t("newFolder")}
          </button>
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              type="text"
              value={props.newFolderName}
              onChange={(e) => props.setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void props.submitNewFolder();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  props.setNewFolderOpen(false);
                  props.setNewFolderName("");
                }
              }}
              placeholder={t("folderNamePlaceholder")}
              aria-label={t("folderNamePlaceholder")}
              autoFocus
              disabled={props.folderCreating}
              style={toolbarFolderInputStyle}
            />
            <button
              type="button"
              onClick={() => void props.submitNewFolder()}
              disabled={props.folderCreating || !props.newFolderName.trim()}
              style={{ ...toolbarActionBtn, color: "var(--dri-text)" }}
            >
              {t("createFolder")}
            </button>
            <button
              type="button"
              onClick={() => {
                props.setNewFolderOpen(false);
                props.setNewFolderName("");
              }}
              disabled={props.folderCreating}
              style={toolbarActionBtn}
            >
              {t("cancel")}
            </button>
          </div>
        ))}
      <button type="button" onClick={() => props.onOpenPalette()} style={toolbarActionBtn}>
        <Command size={16} aria-hidden />
        {t("openPalette")}
      </button>
      {props.viewMode !== "file" && (
        <div
          style={{
            display: "flex",
            border: "1px solid var(--dri-border)",
            borderRadius: 6,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => props.setView("list")}
            style={{ background: "transparent", border: "none", padding: 6 }}
            aria-pressed={props.view === "list"}
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => props.setView("grid")}
            style={{ background: "transparent", border: "none", padding: 6 }}
            aria-pressed={props.view === "grid"}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
      )}
      {props.preview && (
        <span style={{ color: "var(--dri-text-muted)", fontSize: 12 }}>
          preview={props.preview}
        </span>
      )}
    </header>
  );
}
