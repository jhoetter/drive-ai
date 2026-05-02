import {
  type ChangeEventHandler,
  type KeyboardEventHandler,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { FolderPlus, FolderUp, Upload } from "lucide-react";

export function DriveToolbar(props: {
  qLocal: string;
  setQLocal: (next: string) => void;
  onSearchKeyDown: KeyboardEventHandler<HTMLInputElement>;
  preview: string | null;
  canUpload: boolean;
  uploading: boolean;
  folderCreating: boolean;
  onRequestNewFolder: () => void;
  onClearUploadError: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  onFileInputChange: ChangeEventHandler<HTMLInputElement>;
  onFolderInputChange: ChangeEventHandler<HTMLInputElement>;
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
          flex: "1 1 0%",
          minWidth: 0,
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
      {props.canUpload ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <input
            ref={props.fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={props.onFileInputChange}
          />
          <input
            ref={props.folderInputRef}
            type="file"
            multiple
            {...{ webkitdirectory: "" }}
            style={{ display: "none" }}
            onChange={props.onFolderInputChange}
          />
          <button
            type="button"
            onClick={() => {
              props.onClearUploadError();
              props.onRequestNewFolder();
            }}
            disabled={props.uploading || props.folderCreating}
            style={{ ...toolbarActionBtn, whiteSpace: "nowrap" }}
          >
            <FolderPlus size={16} aria-hidden />
            {t("newFolder")}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onClearUploadError();
              props.fileInputRef.current?.click();
            }}
            disabled={props.uploading || props.folderCreating}
            style={{ ...toolbarActionBtn, whiteSpace: "nowrap" }}
          >
            <Upload size={16} aria-hidden />
            {t("upload")}
          </button>
          <button
            type="button"
            onClick={() => {
              props.onClearUploadError();
              props.folderInputRef.current?.click();
            }}
            disabled={props.uploading || props.folderCreating}
            style={{ ...toolbarActionBtn, whiteSpace: "nowrap" }}
          >
            <FolderUp size={16} aria-hidden />
            {t("uploadFolder")}
          </button>
        </div>
      ) : null}
      {props.preview && (
        <span style={{ color: "var(--dri-text-muted)", fontSize: 12 }}>
          preview={props.preview}
        </span>
      )}
    </header>
  );
}
