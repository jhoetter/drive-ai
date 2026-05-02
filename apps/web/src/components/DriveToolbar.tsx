import { type KeyboardEventHandler, type CSSProperties, type ReactElement } from "react";
import type { NavigateFunction } from "react-router";
import { useTranslation } from "react-i18next";
import { FolderPlus } from "lucide-react";

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
  onRequestNewFolder: () => void;
}): ReactElement {
  const { t } = useTranslation("trans");

  const toolbarActionBtn: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid var(--dri-border)",
    borderRadius: "var(--hof-radius-lg)",
    padding: "6px 10px",
    background: "var(--dri-surface-1)",
    cursor: "pointer",
    color: "var(--dri-text-muted)",
    fontSize: 13,
  };

  const searchInFolderStyle: CSSProperties = {
    ...toolbarActionBtn,
    whiteSpace: "nowrap",
  };

  const headerChrome: CSSProperties = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "8px 12px",
    borderBottom: "1px solid var(--dri-border)",
    flexShrink: 0,
    justifyContent: "flex-start",
  };

  const searchInputStyle: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    minWidth: 0,
    borderRadius: "var(--hof-radius-md)",
    border: "1px solid var(--dri-border)",
    padding: "7px 10px",
    background: "var(--dri-surface-0)",
    color: "var(--dri-text)",
    fontSize: 14,
  };

  return (
    <header style={headerChrome}>
      <div
        style={{
          flex: "0 1 26rem",
          minWidth: 160,
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
        }}
      >
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
      {props.canUpload && (
        <button
          type="button"
          onClick={props.onRequestNewFolder}
          disabled={props.uploading || props.folderCreating}
          style={{ ...toolbarActionBtn, whiteSpace: "nowrap" }}
        >
          <FolderPlus size={16} aria-hidden />
          {t("newFolder")}
        </button>
      )}
      {props.preview && (
        <span style={{ color: "var(--dri-text-muted)", fontSize: 12 }}>
          preview={props.preview}
        </span>
      )}
    </header>
  );
}
