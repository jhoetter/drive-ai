import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DriveBreadcrumbs, DriveListSkeleton, DriveListView, DriveNavItem, type DriveListDisplayRow, type DriveListSortDir, type DriveListSortKey } from "@driveai/ui";
import { ThemeProvider } from "next-themes";
import {
  HofShellLayout,
  fetchHofShellUser,
  type HofShellNavGroup,
  type HofShellUser,
} from "@hofos/shell-ui";
import { FolderPlus, FolderUp, Upload } from "lucide-react";
import { create } from "zustand";
import {
  CommandPalette as HofCommandPalette,
  createAppLinkCommands,
  useRegisteredSearchShortcut,
  useShortcut,
  type CommandItem,
} from "@hofos/ux";
import { driveApi, type DriveItem, sha256Hex } from "./api";
import { DriveToolbar } from "./components/DriveToolbar";
import { applyDriveStarLocally } from "./drive-star-cache";
import { sortDriveItems } from "./drive-sort";
import { driveItemToDisplayRow, searchHitToDriveItem } from "./drive-rows";
import { NewFolderModal } from "./components/NewFolderModal";
import { MoveToFolderModal } from "./components/MoveToFolderModal";
import { RenameItemModal } from "./components/RenameItemModal";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { createHandoffAppLinks, navigateHandoffHref } from "./hofShellNavigation";
import { driveShellSignOut } from "./shell-session";

/** Horizontal inset for main chrome; aligns with list row horizontal padding (.dri-drive-row). */
const MAIN_INSET = "0.5rem";

type DriveView =
  | { mode: "folder"; folderId: string }
  | { mode: "file"; fileId: string }
  | { mode: "recent" }
  | { mode: "starred" }
  | { mode: "trash" }
  | { mode: "sharedWithMe" }
  | { mode: "sharedDrives" }
  | { mode: "search" }
  | { mode: "myDriveDefault" }
  | { mode: "home" };

function driveView(
  pathname: string,
  rootId: string | undefined,
  fileId: string | undefined,
): DriveView {
  if (pathname === "/drive/home") return { mode: "home" };
  if (pathname === "/drive/recent") return { mode: "recent" };
  if (pathname === "/drive/starred") return { mode: "starred" };
  if (pathname === "/drive/trash") return { mode: "trash" };
  if (pathname === "/drive/shared-with-me") return { mode: "sharedWithMe" };
  if (pathname === "/drive/shared-drives") return { mode: "sharedDrives" };
  if (pathname === "/drive/search") return { mode: "search" };
  if (fileId) return { mode: "file", fileId };
  if (rootId) return { mode: "folder", folderId: rootId };
  if (pathname === "/drive" || pathname === "/drive/my-drive") return { mode: "myDriveDefault" };
  return { mode: "myDriveDefault" };
}

const usePalette = create<{
  open: boolean;
  query: string;
  set: (p: Partial<{ open: boolean; query: string }>) => void;
}>()((set) => ({
  open: false,
  query: "",
  set: (p) => set(p),
}));

function useKeyboardPalette() {
  const set = usePalette((state) => state.set);
  useShortcut(
    useMemo(
      () => [
        {
          key: "k",
          meta: true,
          description: "Toggle command palette",
          run: () => set({ open: !usePalette.getState().open, query: "" }),
        },
      ],
      [set],
    ),
  );
}

const OFFICE_FILE_EXTENSIONS = new Set(["docx", "xlsx", "pptx", "pdf"]);
const DRIVEAI_OS_SUBAPP_PREFIX = "/__subapps/driveai";

function positiveIntParam(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseDriveSortKey(raw: string | null): DriveListSortKey {
  const x = (raw ?? "name").toLowerCase();
  if (x === "modified" || x === "size") return x;
  return "name";
}

function parseDriveSortDir(raw: string | null): DriveListSortDir {
  return (raw ?? "").toLowerCase() === "desc" ? "desc" : "asc";
}

function hofOsBaseUrl(): string {
  const env = (
    import.meta as unknown as {
      env?: { VITE_HOF_OS_PUBLIC_URL?: string; HOF_OS_PUBLIC_URL?: string };
    }
  ).env;
  const configured = (env?.VITE_HOF_OS_PUBLIC_URL || env?.HOF_OS_PUBLIC_URL || "").replace(
    /\/$/,
    "",
  );
  if (configured) return configured;
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.endsWith(".localhost")
  ) {
    return "http://localhost:3000";
  }
  return `${window.location.protocol}//app.${window.location.hostname.replace(/^drive\./, "")}`;
}

function hofOsDriveUrl(): string {
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const subappPath = target.startsWith(`${DRIVEAI_OS_SUBAPP_PREFIX}/`)
    ? target
    : `${DRIVEAI_OS_SUBAPP_PREFIX}${target.startsWith("/") ? target : `/${target}`}`;
  return `${hofOsBaseUrl()}${subappPath}`;
}

function isUnauthorizedErrorMessage(message: string): boolean {
  return /(^|\D)401(\D|$)/.test(message);
}

function isOfficeEditable(item: DriveItem): boolean {
  if (item.type !== "file" || !item.s3Key) return false;
  const ext = item.name.split(".").pop()?.toLowerCase();
  return Boolean(ext && OFFICE_FILE_EXTENSIONS.has(ext));
}

function openOfficeEditor(item: DriveItem): void {
  if (!item.s3Key) return;
  const url = new URL("/edit-asset", hofOsBaseUrl());
  const currentDrivePath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const returnPath = currentDrivePath.startsWith(`${DRIVEAI_OS_SUBAPP_PREFIX}/`)
    ? currentDrivePath
    : `${DRIVEAI_OS_SUBAPP_PREFIX}${currentDrivePath}`;
  url.searchParams.set("key", item.s3Key);
  url.searchParams.set("from", returnPath);
  window.location.href = url.toString();
}

async function triggerDriveDownload(fileId: string): Promise<void> {
  const d = await driveApi.download(fileId);
  const a = document.createElement("a");
  a.href = d.url;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.download = d.name;
  a.click();
}

function FileDetailPane(props: { fileId: string; onBack: () => void }) {
  const { t } = useTranslation("trans");
  const itemQ = useQuery({
    queryKey: ["item", props.fileId],
    queryFn: () => driveApi.item(props.fileId),
  });
  const onDownload = async () => {
    await triggerDriveDownload(props.fileId);
  };

  if (itemQ.isLoading) {
    return <p style={{ color: "var(--dri-text-muted)" }}>…</p>;
  }
  if (itemQ.isError) {
    return (
      <div>
        <p style={{ fontWeight: 600 }}>{t("noPermission")}</p>
        <button
          type="button"
          onClick={props.onBack}
          style={{
            marginTop: 8,
            borderRadius: "var(--hof-radius-lg)",
            border: "1px solid var(--dri-border)",
            padding: "6px 10px",
          }}
        >
          {t("back")}
        </button>
      </div>
    );
  }
  const it = itemQ.data!.item;
  const canOpenInOffice = isOfficeEditable(it);
  return (
    <div>
      <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{it.name}</p>
      <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginBottom: 8 }}>
        {it.type} {it.size != null ? ` · ${it.size} B` : ""}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canOpenInOffice && (
          <button
            type="button"
            onClick={() => openOfficeEditor(it)}
            style={{
              borderRadius: "var(--hof-radius-lg)",
              border: "1px solid var(--dri-border)",
              padding: "8px 14px",
              background: "var(--dri-surface-1)",
              cursor: "pointer",
            }}
          >
            {t("openInOffice")}
          </button>
        )}
        <button
          type="button"
          onClick={() => void onDownload()}
          style={{
            borderRadius: "var(--hof-radius-lg)",
            border: "1px solid var(--dri-border)",
            padding: "8px 14px",
            background: "var(--dri-surface-1)",
            cursor: "pointer",
          }}
        >
          {t("downloadFile")}
        </button>
      </div>
    </div>
  );
}

function DriveShell() {
  const { t, i18n } = useTranslation("trans");
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { rootId, fileId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const preview = searchParams.get("preview");
  const spQ = searchParams.get("q") || "";
  const drivePage = positiveIntParam(searchParams.get("drive_page"), 1);
  const driveLimit = positiveIntParam(searchParams.get("drive_limit"), 25);
  const folderType = searchParams.get("type");
  const driveSortKey = parseDriveSortKey(searchParams.get("drive_sort"));
  const driveSortDir = parseDriveSortDir(searchParams.get("drive_order"));
  const qc = useQueryClient();

  const onToggleListStar = useCallback(
    async (dr: DriveListDisplayRow, nextStarred: boolean) => {
      const prevStarred = dr.starred ?? false;
      setUploadError(null);
      applyDriveStarLocally(qc, dr.id, nextStarred);
      const refreshStarCaches = () => {
        void qc.invalidateQueries({ queryKey: ["children"], exact: false });
        void qc.invalidateQueries({ queryKey: ["starred"], exact: false });
        void qc.invalidateQueries({ queryKey: ["recent"], exact: false });
        void qc.invalidateQueries({ queryKey: ["search"], exact: false });
        void qc.invalidateQueries({ queryKey: ["sharedWithMe"], exact: false });
        void qc.invalidateQueries({ queryKey: ["trash"], exact: false });
        void qc.invalidateQueries({ queryKey: ["item", dr.id] });
      };
      try {
        await driveApi.setItemStarred(dr.id, nextStarred);
        refreshStarCaches();
      } catch (e) {
        applyDriveStarLocally(qc, dr.id, prevStarred);
        refreshStarCaches();
        const msg = e instanceof Error ? e.message : String(e ?? "");
        setUploadError(`${t("starToggleError")}: ${msg}`);
      }
    },
    [qc, t],
  );
  const { open, query, set } = usePalette();
  useKeyboardPalette();
  useRegisteredSearchShortcut();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const staleFolderRedirectRef = useRef(false);
  const lastRouteFolderId = useRef<string | undefined>(undefined);
  const [qLocal, setQLocal] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderCreating, setFolderCreating] = useState(false);
  const [shellUser, setShellUser] = useState<HofShellUser | null>(null);
  const [selectedListItemId, setSelectedListItemId] = useState<string | null>(null);
  const [movePickerItem, setMovePickerItem] = useState<Pick<DriveItem, "id" | "name" | "type"> | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<Pick<DriveItem, "id" | "name" | "type"> | null>(null);
  const [trashConfirmTarget, setTrashConfirmTarget] = useState<DriveListDisplayRow | null>(null);

  const viewMode = driveView(pathname, rootId, fileId);

  useEffect(() => {
    setSelectedListItemId(null);
  }, [pathname, rootId, viewMode.mode]);

  useEffect(() => {
    if (viewMode.mode === "search") {
      setQLocal(spQ);
    }
  }, [viewMode.mode, spQ]);

  useEffect(() => {
    let alive = true;
    void fetchHofShellUser({ endpoint: "/api/me", fallbackName: "Drive" }).then((user) => {
      if (alive) setShellUser(user);
    });
    return () => {
      alive = false;
    };
  }, []);

  const drivesQ = useQuery({
    queryKey: ["drives"],
    queryFn: driveApi.drives,
    retry: (failureCount, error) => {
      const message = error instanceof Error ? error.message : String(error ?? "");
      return !isUnauthorizedErrorMessage(message) && failureCount < 3;
    },
  });
  const root = drivesQ.data?.drives[0];
  const drivesErrorMessage =
    drivesQ.error instanceof Error ? drivesQ.error.message : String(drivesQ.error ?? "");
  const needsHofHandoff = drivesQ.isError && isUnauthorizedErrorMessage(drivesErrorMessage);

  useEffect(() => {
    if (!needsHofHandoff) return;
    window.location.href = hofOsDriveUrl();
  }, [needsHofHandoff]);

  const effectiveFolderId: string | undefined =
    viewMode.mode === "folder"
      ? viewMode.folderId
      : viewMode.mode === "myDriveDefault" || viewMode.mode === "home"
        ? (root?.rootFolderId ?? undefined)
        : undefined;

  const inFolder =
    viewMode.mode === "folder" || viewMode.mode === "myDriveDefault" || viewMode.mode === "home";

  const canUpload = inFolder && Boolean(effectiveFolderId);
  const canScopeSearchToFolder = canUpload;

  useEffect(() => {
    if (!canUpload) setNewFolderOpen(false);
  }, [canUpload]);

  const childrenQ = useQuery({
    queryKey: ["children", effectiveFolderId, drivePage, driveLimit, folderType],
    queryFn: () =>
      driveApi.children(effectiveFolderId!, {
        page: drivePage,
        limit: driveLimit,
        type: folderType,
      }),
    enabled: inFolder && Boolean(effectiveFolderId),
  });
  const recentQ = useQuery({
    queryKey: ["recent"],
    queryFn: driveApi.recent,
    enabled: viewMode.mode === "recent",
  });
  const starredQ = useQuery({
    queryKey: ["starred"],
    queryFn: driveApi.starred,
    enabled: viewMode.mode === "starred",
  });
  const trashQ = useQuery({
    queryKey: ["trash"],
    queryFn: driveApi.trashItems,
    enabled: viewMode.mode === "trash",
  });
  const sharedWithMeQ = useQuery({
    queryKey: ["sharedWithMe"],
    queryFn: driveApi.sharedWithMe,
    enabled: viewMode.mode === "sharedWithMe",
  });
  const sharedDrivesQ = useQuery({
    queryKey: ["sharedDrives"],
    queryFn: driveApi.sharedDrives,
    staleTime: 120_000,
  });

  const driveRootById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of drivesQ.data?.drives ?? []) {
      if (d.id && d.rootFolderId) m.set(d.id, d.rootFolderId);
    }
    for (const d of sharedDrivesQ.data?.drives ?? []) {
      if (d.id && d.rootFolderId) m.set(d.id, d.rootFolderId);
    }
    return m;
  }, [drivesQ.data?.drives, sharedDrivesQ.data?.drives]);
  const searchFilters = useMemo(() => {
    const o = searchParams.get("offset");
    return {
      q: searchParams.get("q") || undefined,
      type: searchParams.get("type") || undefined,
      owner: searchParams.get("owner") || undefined,
      driveId: searchParams.get("driveId") || undefined,
      folderId: searchParams.get("folderId") || undefined,
      modifiedAfter: searchParams.get("modifiedAfter") || undefined,
      modifiedBefore: searchParams.get("modifiedBefore") || undefined,
      label: searchParams.get("label") || undefined,
      trash: searchParams.get("trash") === "true",
      offset: o ? Number(o) : undefined,
      limit: 50,
    };
  }, [searchParams]);

  const hasSearchCriteria = useMemo(() => {
    return Boolean(
      (searchFilters.q && searchFilters.q.length > 0) ||
      searchFilters.type ||
      searchFilters.owner ||
      searchFilters.driveId ||
      searchFilters.folderId ||
      searchFilters.modifiedAfter ||
      searchFilters.modifiedBefore ||
      searchFilters.label ||
      searchFilters.trash,
    );
  }, [searchFilters]);

  const mergeSearch = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const p = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "") p.delete(k);
        else p.set(k, v);
      }
      setSearchParams(p);
    },
    [searchParams, setSearchParams],
  );

  const refreshAfterStructuralChange = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["children"], exact: false });
    void qc.invalidateQueries({ queryKey: ["recent"] });
    void qc.invalidateQueries({ queryKey: ["starred"] });
    void qc.invalidateQueries({ queryKey: ["search"], exact: false });
    void qc.invalidateQueries({ queryKey: ["sharedWithMe"] });
    void qc.invalidateQueries({ queryKey: ["sharedDrives"] });
    void qc.invalidateQueries({ queryKey: ["trash"] });
  }, [qc]);

  const handleListSortChange = useCallback(
    (key: DriveListSortKey) => {
      const same = driveSortKey === key;
      const nextDir: DriveListSortDir = same
        ? driveSortDir === "asc"
          ? "desc"
          : "asc"
        : key === "modified"
          ? "desc"
          : "asc";
      mergeSearch({
        drive_sort: key,
        drive_order: nextDir,
        ...(inFolder ? { drive_page: "1" } : {}),
      });
    },
    [driveSortKey, driveSortDir, inFolder, mergeSearch],
  );

  const triggerDownloadForDisplay = useCallback(
    async (row: Pick<DriveListDisplayRow, "id" | "type">) => {
      if (row.type !== "file") return;
      setUploadError(null);
      try {
        await triggerDriveDownload(row.id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? "");
        setUploadError(`${t("downloadError")}: ${msg}`);
      }
    },
    [t],
  );

  const openMovePickerForRow = useCallback((row: Pick<DriveListDisplayRow, "id" | "name" | "type">) => {
    setMovePickerItem({ id: row.id, name: row.name, type: row.type });
  }, []);

  const onDragMoveRowToFolder = useCallback(
    async (dragged: Pick<DriveListDisplayRow, "id" | "type" | "name">, targetFolderId: string) => {
      if (dragged.id === targetFolderId) return;
      setUploadError(null);
      try {
        await driveApi.moveItem(dragged.id, targetFolderId);
        setSelectedListItemId((cur) => (cur === dragged.id ? null : cur));
        refreshAfterStructuralChange();
        void qc.invalidateQueries({ queryKey: ["item", dragged.id] });
        void qc.invalidateQueries({ queryKey: ["breadcrumb"], exact: false });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? "");
        setUploadError(`${t("moveError")}: ${msg}`);
      }
    },
    [qc, refreshAfterStructuralChange, t],
  );

  const performTrashRow = useCallback(
    async (dr: DriveListDisplayRow) => {
      setUploadError(null);
      try {
        const kind = dr.type === "folder" ? ("folder" as const) : ("file" as const);
        await driveApi.trashItem(dr.id, kind);
        setSelectedListItemId((cur) => (cur === dr.id ? null : cur));
        refreshAfterStructuralChange();
        void qc.invalidateQueries({ queryKey: ["item", dr.id] });
        void qc.invalidateQueries({ queryKey: ["breadcrumb"], exact: false });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e ?? "");
        setUploadError(`${t("trashError")}: ${msg}`);
      }
    },
    [qc, refreshAfterStructuralChange, t],
  );

  const openTrashConfirm = useCallback((dr: DriveListDisplayRow) => {
    setTrashConfirmTarget(dr);
  }, []);

  const showListRowActions = viewMode.mode !== "trash" && viewMode.mode !== "sharedDrives";

  const searchQ = useQuery({
    queryKey: ["search", searchFilters],
    queryFn: () => driveApi.search(searchFilters),
    enabled: viewMode.mode === "search" && hasSearchCriteria,
  });

  const breadId = fileId ?? (inFolder && effectiveFolderId ? effectiveFolderId : undefined);
  const breadQ = useQuery({
    queryKey: ["breadcrumb", breadId],
    queryFn: () => driveApi.breadcrumb(breadId!),
    enabled: Boolean(breadId) && (inFolder || viewMode.mode === "file"),
  });

  const pageTitle = useMemo(() => {
    switch (viewMode.mode) {
      case "home":
        return t("home");
      case "recent":
        return t("recent");
      case "starred":
        return t("starred");
      case "trash":
        return t("trash");
      case "sharedWithMe":
        return t("sharedWithMe");
      case "sharedDrives":
        return t("sharedDrives");
      case "search":
        return t("pageTitleSearch");
      case "file": {
        const fsegs = breadQ.data?.segments;
        if (fsegs && fsegs.length > 0) {
          return fsegs[fsegs.length - 1]!.name;
        }
        return t("appTitle");
      }
      case "myDriveDefault":
      case "folder": {
        const segs = breadQ.data?.segments;
        if (segs && segs.length > 0) {
          return segs[segs.length - 1]!.name;
        }
        return t("myDrive");
      }
      default:
        return t("appTitle");
    }
  }, [viewMode, breadQ.data?.segments, t]);

  useEffect(() => {
    if (rootId !== lastRouteFolderId.current) {
      staleFolderRedirectRef.current = false;
      lastRouteFolderId.current = rootId;
    }
  }, [rootId]);

  useEffect(() => {
    if (viewMode.mode !== "folder") return;
    if (!childrenQ.isError || !root?.rootFolderId) return;
    if (staleFolderRedirectRef.current) return;
    const err = childrenQ.error;
    const msg = err instanceof Error ? err.message : String(err);
    if (!/(^|\D)403(\D|$)/i.test(msg) && !/forbidden/i.test(msg)) return;
    staleFolderRedirectRef.current = true;
    nav(`/drive/f/${root.rootFolderId}`, { replace: true });
  }, [viewMode, childrenQ.isError, childrenQ.error, root?.rootFolderId, nav]);

  const openItem = (r: DriveItem) => {
    if (!r.id) return;
    if (r.type === "folder") {
      void nav(`/drive/f/${r.id}`);
      return;
    }
    if (isOfficeEditable(r)) {
      openOfficeEditor(r);
      return;
    }
    void nav(`/drive/file/${r.id}`);
  };

  const uploadOneFile = async (f: File, parentId: string, pathCache: Map<string, string>) => {
    const w = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
    let dirSegments: string[] = [];
    let baseName = f.name;
    if (w && w.length > 0) {
      const parts = w.split("/").filter((p) => p.length > 0);
      if (parts.length > 1) {
        dirSegments = parts.slice(0, -1);
        baseName = parts[parts.length - 1] ?? f.name;
      }
    }
    const pKey = dirSegments.join("/");
    let targetParent = parentId;
    if (dirSegments.length > 0) {
      if (pathCache.has(pKey)) {
        targetParent = pathCache.get(pKey)!;
      } else {
        const { folderId } = await driveApi.folderEnsurePath(parentId, dirSegments);
        pathCache.set(pKey, folderId);
        targetParent = folderId;
      }
    }
    const ab = await f.arrayBuffer();
    const sha = await sha256Hex(ab);
    const init = await driveApi.initUpload({
      parentId: targetParent,
      name: baseName,
      contentType: f.type || "application/octet-stream",
      size: f.size,
    });
    const put = await driveApi.uploadBytes(init, f);
    if (!put.ok) {
      await driveApi.abandonUpload({ fileId: init.fileId });
      throw new Error(`store failed (${put.status})`);
    }
    await driveApi.completeUpload({
      fileId: init.fileId,
      sha256: sha,
      size: f.size,
      contentType: f.type || "application/octet-stream",
    });
  };

  const uploadFiles = async (fileList: FileList | File[]) => {
    if (!inFolder || !effectiveFolderId) return;
    setUploadError(null);
    setUploading(true);
    const pathCache = new Map<string, string>();
    const files = Array.from(fileList);
    let firstErr: string | null = null;
    for (const f of files) {
      try {
        await uploadOneFile(f, effectiveFolderId, pathCache);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        firstErr = firstErr ?? msg;
      }
    }
    setUploading(false);
    if (firstErr) setUploadError(`${t("uploadError")}: ${firstErr}`);
    await qc.refetchQueries({ queryKey: ["children", effectiveFolderId] });
    void qc.invalidateQueries({ queryKey: ["recent"] });
    void qc.invalidateQueries({ queryKey: ["search"] });
  };

  const onScrollAreaDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    if (!e.dataTransfer.files?.length) return;
    await uploadFiles(e.dataTransfer.files);
  };

  const onFileInputChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.target.files;
    if (files?.length) await uploadFiles(files);
    e.target.value = "";
  };

  const onFolderInputChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = e.target.files;
    if (files?.length) await uploadFiles(files);
    e.target.value = "";
  };

  useEffect(() => {
    const q = qLocal.trim();
    const t = window.setTimeout(() => {
      if (viewMode.mode === "search") {
        mergeSearch({ q: q || null, offset: null });
      } else if (q.length > 0) {
        void nav({ pathname: "/drive/search", search: `q=${encodeURIComponent(q)}` });
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [qLocal, viewMode.mode, mergeSearch, nav]);

  useEffect(() => {
    if (pathname === "/drive" && !rootId && !fileId) {
      void nav("/drive/home", { replace: true });
    }
  }, [nav, pathname, rootId, fileId]);

  const appLinks = useMemo(
    () => createHandoffAppLinks({ selfAppId: "driveai", selfHref: "/drive/home" }),
    [],
  );

  const paletteCommands = useMemo<CommandItem[]>(
    () => [
      {
        id: "drive:home",
        group: "Drive",
        label: t("home"),
        perform: () => void nav("/drive/home"),
      },
      {
        id: "drive:my-drive",
        group: "Drive",
        label: t("myDrive"),
        perform: () => void nav("/drive/my-drive"),
      },
      {
        id: "drive:recent",
        group: "Drive",
        label: t("recent"),
        perform: () => void nav("/drive/recent"),
      },
      ...(canUpload
        ? [
            {
              id: "drive:new-folder",
              group: "Drive",
              label: t("newFolder"),
              keywords: ["folder", "create", "mkdir", "directory"] as const,
              perform: () => {
                setUploadError(null);
                setNewFolderOpen(true);
                usePalette.getState().set({ open: false, query: "" });
              },
            } satisfies CommandItem,
          ]
        : []),
      ...createAppLinkCommands(appLinks, {
        navigate: (href) => navigateHandoffHref(href),
      }),
    ],
    [appLinks, canUpload, nav, t],
  );

  const rows: DriveItem[] = useMemo(() => {
    if (
      viewMode.mode === "folder" ||
      viewMode.mode === "myDriveDefault" ||
      viewMode.mode === "home"
    ) {
      return (childrenQ.data?.items ?? []).map((x) => x.item);
    }
    if (viewMode.mode === "recent") {
      return (recentQ.data?.items ?? []).map((x) => x.item);
    }
    if (viewMode.mode === "starred") {
      return (starredQ.data?.items ?? []).map((x) => x.item);
    }
    if (viewMode.mode === "trash") {
      return (trashQ.data?.items ?? []).map((x) => x.item);
    }
    if (viewMode.mode === "sharedWithMe") {
      return (sharedWithMeQ.data?.items ?? []).map((x) => x.item);
    }
    if (viewMode.mode === "sharedDrives") {
      return (sharedDrivesQ.data?.drives ?? [])
        .filter((d) => d.rootFolderId)
        .map((d) => ({
          id: d.rootFolderId!,
          name: d.name,
          type: "folder",
          driveId: d.id,
          parentId: null,
        }));
    }
    if (viewMode.mode === "search") {
      return (searchQ.data?.results ?? []).map(searchHitToDriveItem);
    }
    return [];
  }, [
    viewMode.mode,
    childrenQ.data,
    recentQ.data,
    starredQ.data,
    trashQ.data,
    sharedWithMeQ.data,
    sharedDrivesQ.data,
    searchQ.data,
  ]);

  const displayLabels = useMemo(
    () => ({
      dash: String(t("emDash")),
      kindFolder: String(t("kindFolder")),
      kindFile: String(t("kindFile")),
      kindOther: String(t("kindOther")),
    }),
    [t],
  );

  const locale = i18n.language ?? "en";

  const sortedRows = useMemo(
    () => sortDriveItems(rows, driveSortKey, driveSortDir),
    [rows, driveSortKey, driveSortDir],
  );

  const displayRows = useMemo(
    () => sortedRows.map((row) => driveItemToDisplayRow(row, locale, displayLabels)),
    [sortedRows, locale, displayLabels],
  );

  const selectedDriveItem = useMemo(
    () => (selectedListItemId ? sortedRows.find((x) => x.id === selectedListItemId) : undefined),
    [sortedRows, selectedListItemId],
  );

  if (drivesQ.isError && viewMode.mode !== "file") {
    const msg = drivesErrorMessage;
    const looks401 = needsHofHandoff;
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("loadError")}</p>
        <pre
          style={{
            fontSize: 12,
            padding: 12,
            borderRadius: "var(--hof-radius-lg)",
            background: "var(--dri-surface-1)",
            border: "1px solid var(--dri-border)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {msg}
        </pre>
        <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>
          {t("apiErrorHint")}
        </p>
        {looks401 && (
          <>
            <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>
              {t("jwtDevHint")}
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.href = hofOsDriveUrl();
              }}
              style={{
                marginTop: 12,
                padding: "8px 14px",
                borderRadius: "var(--hof-radius-lg)",
                border: "1px solid var(--dri-border)",
                background: "var(--dri-surface-0)",
                cursor: "pointer",
              }}
            >
              {t("openViaHofOs")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void drivesQ.refetch()}
          style={{
            marginTop: 12,
            padding: "8px 14px",
            borderRadius: "var(--hof-radius-lg)",
            border: "1px solid var(--dri-border)",
            background: "var(--dri-surface-0)",
            cursor: "pointer",
          }}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (!effectiveFolderId && inFolder && drivesQ.isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <DriveListSkeleton rows={4} />
      </div>
    );
  }
  if (!effectiveFolderId && inFolder) {
    if (drivesQ.isSuccess) {
      const d = drivesQ.data.drives[0];
      if (!d || !d.rootFolderId) {
        return (
          <div style={{ padding: 24, maxWidth: 520 }}>
            <p style={{ fontWeight: 600 }}>{t("notConfigured")}</p>
            <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>
              {t("apiErrorHint")}
            </p>
          </div>
        );
      }
    }
    return <div style={{ padding: 24 }}>{t("notConfigured")}</div>;
  }

  const listLoading = (() => {
    if (
      viewMode.mode === "folder" ||
      viewMode.mode === "myDriveDefault" ||
      viewMode.mode === "home"
    ) {
      return childrenQ.isLoading && !childrenQ.isError;
    }
    if (viewMode.mode === "recent") return recentQ.isLoading;
    if (viewMode.mode === "starred") return starredQ.isLoading;
    if (viewMode.mode === "trash") return trashQ.isLoading;
    if (viewMode.mode === "sharedWithMe") return sharedWithMeQ.isLoading;
    if (viewMode.mode === "sharedDrives") return sharedDrivesQ.isLoading;
    if (viewMode.mode === "search" && hasSearchCriteria) return searchQ.isLoading;
    return false;
  })();

  const onSearchKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = e.currentTarget.value.trim();
      mergeSearch({ q: v || null, offset: null });
    }
  };

  const chipStyle: React.CSSProperties = {
    fontSize: 13,
    padding: "4px 10px",
    borderRadius: "var(--hof-radius-full)",
    border: "1px solid var(--dri-border)",
    background: "var(--dri-surface-1)",
    cursor: "pointer",
    color: "var(--dri-text)",
  };

  const paletteRowBtn: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: "var(--dri-text)",
    padding: 8,
    cursor: "pointer",
  };

  const submitNewFolderWithName = async (nameRaw: string) => {
    const name = nameRaw.trim();
    if (!name || !effectiveFolderId) return;
    setUploadError(null);
    setFolderCreating(true);
    try {
      await driveApi.folderCreate(effectiveFolderId, name);
      setNewFolderOpen(false);
      await qc.refetchQueries({ queryKey: ["children", effectiveFolderId] });
      void qc.invalidateQueries({ queryKey: ["search"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadError(`${t("folderCreateError")}: ${msg}`);
    } finally {
      setFolderCreating(false);
    }
  };

  const p = pathname;
  const inFile = viewMode.mode === "file";
  const isNavHome = !inFile && p === "/drive/home";
  const isNavMyDrive =
    !inFile && (viewMode.mode === "myDriveDefault" || viewMode.mode === "folder");
  const isNavRecent = !inFile && p === "/drive/recent";
  const isNavStarred = !inFile && p === "/drive/starred";
  const isNavShared = !inFile && p === "/drive/shared-with-me";
  const isNavSharedDrives = !inFile && p === "/drive/shared-drives";
  const isNavTrash = !inFile && p === "/drive/trash";

  const shellToolbar = (
    <DriveToolbar
      qLocal={qLocal}
      setQLocal={setQLocal}
      onSearchKeyDown={onSearchKeyDown}
      preview={preview}
      nav={nav}
      canScopeSearchToFolder={canScopeSearchToFolder}
      effectiveFolderId={effectiveFolderId}
      canUpload={canUpload}
      uploading={uploading}
      folderCreating={folderCreating}
      onRequestNewFolder={() => {
        setUploadError(null);
        setNewFolderOpen(true);
      }}
    />
  );

  const driveNavGroups: HofShellNavGroup[] = [
    {
      id: "drive",
      label: "Drive",
      items: [
        { id: "home", label: t("home"), path: "/drive/home", icon: "home", active: isNavHome },
        {
          id: "my-drive",
          label: t("myDrive"),
          path: "/drive/my-drive",
          icon: "folder",
          active: isNavMyDrive,
        },
        {
          id: "recent",
          label: t("recent"),
          path: "/drive/recent",
          icon: "clock",
          active: isNavRecent,
        },
        {
          id: "starred",
          label: t("starred"),
          path: "/drive/starred",
          icon: "star",
          active: isNavStarred,
        },
        {
          id: "shared",
          label: t("sharedWithMe"),
          path: "/drive/shared-with-me",
          icon: "users",
          active: isNavShared,
        },
        {
          id: "shared-drives",
          label: t("sharedDrives"),
          path: "/drive/shared-drives",
          icon: "hard-drive",
          active: isNavSharedDrives,
        },
        {
          id: "trash",
          label: t("trash"),
          path: "/drive/trash",
          icon: "trash-2",
          active: isNavTrash,
        },
      ],
    },
  ];

  const uploadSlot = canUpload ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={onFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...{ webkitdirectory: "" }}
        style={{ display: "none" }}
        onChange={onFolderInputChange}
      />
      <button
        type="button"
        onClick={() => {
          setUploadError(null);
          setNewFolderOpen(true);
        }}
        disabled={uploading || folderCreating}
        className="hof-shell-command"
      >
        <FolderPlus size={14} aria-hidden />
        {t("newFolder")}
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || folderCreating}
        className="hof-shell-command"
      >
        <Upload size={14} aria-hidden />
        {t("upload")}
      </button>
      <button
        type="button"
        onClick={() => folderInputRef.current?.click()}
        disabled={uploading || folderCreating}
        className="hof-shell-command"
      >
        <FolderUp size={14} aria-hidden />
        {t("uploadFolder")}
      </button>
    </div>
  ) : null;

  const renderShell = (content: ReactNode) => (
    <HofShellLayout
      appId="driveai"
      appLabel="Drive"
      appIcon="hard-drive"
      currentPath={pathname}
      primaryNavGroups={driveNavGroups}
      appLinks={appLinks}
      user={shellUser}
      onSignOut={() => driveShellSignOut()}
      onCommand={() => set({ open: true, query: "" })}
      onNavigate={(path) => {
        if (path.startsWith("/") && !path.startsWith("/__subapps/")) nav(path);
        else navigateHandoffHref(path);
      }}
      topSlot={uploadSlot}
    >
      {content}
      <HofCommandPalette
        open={open}
        onOpenChange={(nextOpen) => set({ open: nextOpen, query: nextOpen ? query : "" })}
        commands={paletteCommands}
        inputValue={query}
        onInputValueChange={(nextQuery) => set({ query: nextQuery })}
      />
    </HofShellLayout>
  );

  if (viewMode.mode === "file" && fileId) {
    return renderShell(
      <>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          {shellToolbar}
          <main
            id="main-content"
            style={{
              flex: 1,
              padding: `12px ${MAIN_INSET} 16px`,
              overflow: "auto",
              minHeight: 0,
            }}
            tabIndex={-1}
          >
            {breadQ.data?.segments && breadQ.data.segments.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <DriveBreadcrumbs
                  compact
                  segments={breadQ.data.segments}
                  renderSegment={(s, label) => (
                    <Link
                      to={s.type === "file" ? `/drive/file/${s.id}` : `/drive/f/${s.id}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {label}
                    </Link>
                  )}
                />
              </div>
            )}
            <FileDetailPane
              fileId={fileId}
              onBack={() => {
                void nav(-1);
              }}
            />
          </main>
        </div>
      </>,
    );
  }

  return renderShell(
    <>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {shellToolbar}
        {uploadError && (
          <div
            style={{
              padding: `8px ${MAIN_INSET}`,
              background: "var(--dri-surface-1)",
              borderBottom: "1px solid var(--dri-border)",
              color: "var(--dri-text)",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>{uploadError}</span>
            <button
              type="button"
              onClick={() => setUploadError(null)}
              style={{
                border: "1px solid var(--dri-border)",
                borderRadius: "var(--hof-radius-md)",
                padding: "2px 8px",
                background: "var(--dri-surface-0)",
              }}
            >
              {t("dismiss")}
            </button>
          </div>
        )}
        {viewMode.mode === "search" && (
          <div
            style={{
              padding: `6px ${MAIN_INSET}`,
              borderBottom: "1px solid var(--dri-border)",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--dri-text)" }}>{pageTitle}</span>
            <span style={{ fontSize: 13, color: "var(--dri-text-muted)" }}>
              {t("searchFilters")}
            </span>
            <button
              type="button"
              style={{
                ...chipStyle,
                fontWeight: searchFilters.type === "pdf" ? 600 : 400,
              }}
              onClick={() =>
                mergeSearch({ type: searchFilters.type === "pdf" ? null : "pdf", offset: null })
              }
            >
              {t("searchChipPdf")}
            </button>
            <button
              type="button"
              style={{
                ...chipStyle,
                fontWeight: searchFilters.type === "image" ? 600 : 400,
              }}
              onClick={() =>
                mergeSearch({ type: searchFilters.type === "image" ? null : "image", offset: null })
              }
            >
              {t("searchChipImage")}
            </button>
            <button
              type="button"
              style={{
                ...chipStyle,
                fontWeight: searchFilters.type === "word" ? 600 : 400,
              }}
              onClick={() =>
                mergeSearch({ type: searchFilters.type === "word" ? null : "word", offset: null })
              }
            >
              {t("searchChipDocs")}
            </button>
            <button
              type="button"
              style={{
                ...chipStyle,
                fontWeight: searchFilters.owner === "me" ? 600 : 400,
              }}
              onClick={() =>
                mergeSearch({ owner: searchFilters.owner === "me" ? null : "me", offset: null })
              }
            >
              {t("searchChipOwnerMe")}
            </button>
            <button
              type="button"
              style={{
                ...chipStyle,
                fontWeight: searchFilters.trash ? 600 : 400,
              }}
              onClick={() =>
                mergeSearch({ trash: searchFilters.trash ? null : "true", offset: null })
              }
            >
              {t("searchChipTrash")}
            </button>
            <button
              type="button"
              style={{ ...chipStyle, color: "var(--dri-text-muted)" }}
              onClick={() => {
                setQLocal("");
                void nav({ pathname: "/drive/search", search: "" });
              }}
            >
              {t("searchClearFilters")}
            </button>
          </div>
        )}
        {inFolder ? (
          <header
            style={{
              padding: `4px ${MAIN_INSET}`,
              borderBottom: "1px solid var(--dri-border)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "4px 14px",
              rowGap: 4,
              background: "var(--dri-surface-0)",
            }}
          >
            {breadQ.data?.segments && breadQ.data.segments.length > 0 ? (
              <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
                <DriveBreadcrumbs
                  compact
                  segments={breadQ.data.segments}
                  renderSegment={(s, label) => (
                    <Link
                      to={s.type === "file" ? `/drive/file/${s.id}` : `/drive/f/${s.id}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {label}
                    </Link>
                  )}
                />
              </div>
            ) : (
              <div style={{ flex: "1 1 0", minWidth: 0 }} aria-hidden />
            )}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--dri-text-muted)" }}>{t("typeFilter")}</span>
              {[
                { value: "", label: t("filterAll") },
                { value: "folder", label: t("filterFolders") },
                { value: "file", label: t("filterFiles") },
              ].map((chip) => {
                const active = (folderType ?? "") === chip.value;
                return (
                  <button
                    key={chip.value || "all"}
                    type="button"
                    aria-pressed={active}
                    style={{
                      ...chipStyle,
                      fontWeight: active ? 600 : 500,
                      color: active ? "var(--dri-text)" : "var(--dri-text-muted)",
                      borderColor: active
                        ? "color-mix(in oklab, var(--dri-primary) 72%, var(--dri-border))"
                        : "color-mix(in oklab, var(--dri-border) 55%, transparent)",
                      borderWidth: 1,
                      background: active
                        ? "color-mix(in oklab, var(--dri-primary) 32%, var(--dri-surface-1))"
                        : "color-mix(in oklab, var(--dri-text-muted) 11%, transparent)",
                      boxShadow: active
                        ? "inset 0 0 0 1px color-mix(in oklab, var(--dri-primary) 42%, transparent)"
                        : undefined,
                    }}
                    onClick={() =>
                      mergeSearch({
                        type: chip.value || null,
                        drive_page: "1",
                      })
                    }
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </header>
        ) : viewMode.mode === "search" ? null : (
          <header
            style={{
              padding: `4px ${MAIN_INSET}`,
              borderBottom: "1px solid var(--dri-border)",
              background: "var(--dri-surface-0)",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--dri-text)" }}>
              {pageTitle}
            </h1>
          </header>
        )}
        <main
          id="main-content"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}
          tabIndex={-1}
        >
          {showListRowActions && selectedDriveItem && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
                padding: `8px ${MAIN_INSET}`,
                borderBottom: "1px solid var(--dri-border)",
                background: "var(--dri-surface-1)",
                fontSize: 14,
              }}
            >
              <span style={{ color: "var(--dri-text-muted)", flex: "1 1 8rem", minWidth: "8rem" }}>
                {t("selectionCount", { count: 1 })}
              </span>
              <button
                type="button"
                onClick={() => openItem(selectedDriveItem)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--hof-radius-lg)",
                  border: "1px solid var(--dri-border)",
                  background: "var(--dri-surface-0)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {t("openItem")}
              </button>
              {selectedDriveItem.type === "file" ? (
                <button
                  type="button"
                  onClick={() =>
                    void triggerDownloadForDisplay({
                      id: selectedDriveItem.id,
                      type: selectedDriveItem.type,
                    })
                  }
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--hof-radius-lg)",
                    border: "1px solid var(--dri-border)",
                    background: "var(--dri-surface-0)",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  {t("downloadFile")}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  openMovePickerForRow({
                    id: selectedDriveItem.id,
                    name: selectedDriveItem.name,
                    type: selectedDriveItem.type,
                  })
                }
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--hof-radius-lg)",
                  border: "1px solid var(--dri-border)",
                  background: "var(--dri-surface-0)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {t("moveAction")}
              </button>
              <button
                type="button"
                onClick={() => setSelectedListItemId(null)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--hof-radius-lg)",
                  border: "1px solid var(--dri-border)",
                  background: "var(--dri-surface-0)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                {t("clearSelection")}
              </button>
            </div>
          )}
          <div
            style={{
              flex: 1,
              padding: "0 0 12px",
              overflow: "auto",
              minHeight: 0,
            }}
            onDrop={canUpload ? onScrollAreaDrop : undefined}
            onDragOver={
              canUpload
                ? (e) => {
                    if ([...e.dataTransfer.types].includes("Files")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }
                  }
                : undefined
            }
          >
            {inFolder && childrenQ.isError && (
              <div
                style={{
                  marginBottom: 16,
                  marginLeft: MAIN_INSET,
                  marginRight: MAIN_INSET,
                  padding: 12,
                  borderRadius: "var(--hof-radius-lg)",
                  border: "1px solid var(--dri-border)",
                }}
              >
                <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("childrenLoadError")}</p>
                <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginBottom: 8 }}>
                  {childrenQ.error instanceof Error
                    ? childrenQ.error.message
                    : String(childrenQ.error)}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void childrenQ.refetch()}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--hof-radius-lg)",
                      border: "1px solid var(--dri-border)",
                      background: "var(--dri-surface-1)",
                      cursor: "pointer",
                    }}
                  >
                    {t("retry")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void nav("/drive/my-drive")}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "var(--hof-radius-lg)",
                      border: "1px solid var(--dri-border)",
                      background: "var(--dri-surface-1)",
                      cursor: "pointer",
                    }}
                  >
                    {t("goToMyDrive")}
                  </button>
                </div>
              </div>
            )}
            {listLoading && (
              <div style={{ paddingLeft: MAIN_INSET, paddingRight: MAIN_INSET }}>
                <DriveListSkeleton />
              </div>
            )}
            {!listLoading &&
              rows.length === 0 &&
              viewMode.mode === "search" &&
              !hasSearchCriteria && (
                <p style={{ color: "var(--dri-text-muted)", padding: `0 ${MAIN_INSET}` }}>
                  {t("typeQueryToSearch")}
                </p>
              )}
            {!listLoading &&
              rows.length === 0 &&
              viewMode.mode === "search" &&
              hasSearchCriteria && (
                <p style={{ color: "var(--dri-text-muted)", padding: `0 ${MAIN_INSET}` }}>
                  {t("noSearchResults")}
                </p>
              )}
            {!listLoading &&
              rows.length === 0 &&
              (viewMode.mode === "folder" ||
                viewMode.mode === "myDriveDefault" ||
                viewMode.mode === "home") &&
              !childrenQ.isError && (
                <div style={{ padding: `0 ${MAIN_INSET}` }}>
                  <p style={{ color: "var(--dri-text-muted)" }}>{t("emptyFolder")}</p>
                  {canUpload && (
                    <>
                      <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>
                        {t("uploadDropHint")}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadError(null);
                          setNewFolderOpen(true);
                        }}
                        disabled={uploading || folderCreating}
                        style={{
                          marginTop: 12,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          border: "1px solid var(--dri-border)",
                          borderRadius: "var(--hof-radius-lg)",
                          padding: "8px 14px",
                          background: "var(--dri-surface-1)",
                          cursor: "pointer",
                          color: "var(--dri-text)",
                          fontSize: 14,
                        }}
                      >
                        <FolderPlus size={16} aria-hidden />
                        {t("newFolder")}
                      </button>
                    </>
                  )}
                </div>
              )}
            {!listLoading && rows.length === 0 && viewMode.mode !== "search" && !inFolder && (
              <p style={{ color: "var(--dri-text-muted)", padding: `0 ${MAIN_INSET}` }}>{t("emptyList")}</p>
            )}
            {viewMode.mode !== "file" && displayRows.length > 0 && (
              <DriveListView
                ariaLabel={String(t("listAriaLabel"))}
                columnLabels={{
                  name: String(t("columnName")),
                  modified: String(t("columnModified")),
                  size: String(t("columnSize")),
                  starAriaAdd: String(t("starAriaAdd")),
                  starAriaRemove: String(t("starAriaRemove")),
                  actions: String(t("columnActions")),
                  rowActionsMenu: String(t("rowActionsTrigger")),
                  download: String(t("downloadFile")),
                  move: String(t("moveAction")),
                  rename: String(t("renameAction")),
                  moveToTrash: String(t("trashToBinAction")),
                }}
                rows={displayRows}
                selectedId={selectedListItemId}
                onRowSelect={(dr) => setSelectedListItemId(dr.id)}
                onClearSelection={() => setSelectedListItemId(null)}
                onRowOpen={(dr) => {
                  const raw = sortedRows.find((x) => x.id === dr.id);
                  if (raw) openItem(raw);
                }}
                sort={{ key: driveSortKey, dir: driveSortDir }}
                onSortChange={handleListSortChange}
                showRowActionsMenu={showListRowActions}
                onRowDownload={showListRowActions ? (dr) => void triggerDownloadForDisplay(dr) : undefined}
                onRowMove={showListRowActions ? (dr) => openMovePickerForRow(dr) : undefined}
                onRowRename={
                  showListRowActions
                    ? (dr) => setRenameTarget({ id: dr.id, name: dr.name, type: dr.type })
                    : undefined
                }
                onRowTrash={showListRowActions ? openTrashConfirm : undefined}
                onDragMoveToFolder={showListRowActions ? onDragMoveRowToFolder : undefined}
                onToggleStar={onToggleListStar}
              />
            )}
            {viewMode.mode === "search" &&
              hasSearchCriteria &&
              searchQ.data?.nextOffset != null &&
              rows.length > 0 && (
                <div style={{ marginTop: 12, padding: `0 ${MAIN_INSET}` }}>
                  <button
                    type="button"
                    onClick={() => mergeSearch({ offset: String(searchQ.data!.nextOffset) })}
                    style={{
                      ...chipStyle,
                      borderRadius: "var(--hof-radius-lg)",
                    }}
                  >
                    {t("searchLoadMore")}
                  </button>
                </div>
              )}
            {inFolder && childrenQ.data && childrenQ.data.total > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 16,
                  padding: `0 ${MAIN_INSET}`,
                  color: "var(--dri-text-muted)",
                  fontSize: 13,
                }}
              >
                <span>
                  {t("paginationSummary", {
                    start: (childrenQ.data.page - 1) * childrenQ.data.limit + 1,
                    end: Math.min(childrenQ.data.page * childrenQ.data.limit, childrenQ.data.total),
                    total: childrenQ.data.total,
                  })}
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select
                    value={String(driveLimit)}
                    onChange={(e) =>
                      mergeSearch({
                        drive_limit: e.currentTarget.value,
                        drive_page: "1",
                      })
                    }
                    style={{
                      border: "1px solid var(--dri-border)",
                      borderRadius: "var(--hof-radius-md)",
                      padding: "6px 8px",
                      background: "var(--dri-surface-0)",
                      color: "var(--dri-text)",
                    }}
                    aria-label={t("itemsPerPage")}
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={childrenQ.data.page <= 1}
                    onClick={() => mergeSearch({ drive_page: String(childrenQ.data!.page - 1) })}
                    style={{
                      ...chipStyle,
                      borderRadius: "var(--hof-radius-lg)",
                      opacity: childrenQ.data.page <= 1 ? 0.5 : 1,
                    }}
                  >
                    {t("previousPage")}
                  </button>
                  <button
                    type="button"
                    disabled={!childrenQ.data.hasMore}
                    onClick={() => mergeSearch({ drive_page: String(childrenQ.data!.page + 1) })}
                    style={{
                      ...chipStyle,
                      borderRadius: "var(--hof-radius-lg)",
                      opacity: childrenQ.data.hasMore ? 1 : 0.5,
                    }}
                  >
                    {t("nextPage")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <MoveToFolderModal
        open={movePickerItem != null}
        onClose={() => setMovePickerItem(null)}
        item={movePickerItem}
        driveRootById={driveRootById}
        fallbackRootFolderId={root?.rootFolderId ?? null}
        onMoved={() => {
          setMovePickerItem(null);
          setSelectedListItemId(null);
          refreshAfterStructuralChange();
        }}
        onError={(msg) => setUploadError(`${t("moveError")}: ${msg}`)}
      />
      <NewFolderModal
        open={newFolderOpen}
        onClose={() => !folderCreating && setNewFolderOpen(false)}
        submitting={folderCreating}
        onSubmit={submitNewFolderWithName}
      />
      <RenameItemModal
        open={renameTarget != null}
        onClose={() => setRenameTarget(null)}
        item={renameTarget}
        onRenamed={() => {
          refreshAfterStructuralChange();
          if (renameTarget) {
            void qc.invalidateQueries({ queryKey: ["item", renameTarget.id] });
          }
          void qc.invalidateQueries({ queryKey: ["breadcrumb"], exact: false });
        }}
        onError={(msg) => setUploadError(`${t("renameError")}: ${msg}`)}
      />
      <ConfirmDialog
        open={trashConfirmTarget != null}
        title={String(t("trashToBinAction"))}
        description={
          trashConfirmTarget
            ? `${String(t("trashConfirm"))}\n\n${trashConfirmTarget.name}`
            : ""
        }
        confirmLabel={String(t("trashToBinAction"))}
        cancelLabel={String(t("cancel"))}
        danger
        onCancel={() => setTrashConfirmTarget(null)}
        onConfirm={async () => {
          const dr = trashConfirmTarget;
          if (!dr) return;
          setTrashConfirmTarget(null);
          await performTrashRow(dr);
        }}
      />
    </>,
  );
}

export function App() {
  return (
    <ThemeProvider
      attribute="data-theme"
      storageKey="hof-color-scheme"
      defaultTheme="system"
      enableSystem
    >
      <Routes>
        <Route path="/" element={<Navigate to="/drive/home" replace />} />
        <Route path="/drive" element={<DriveShell />} />
        <Route path="/drive/home" element={<DriveShell />} />
        <Route path="/drive/my-drive" element={<MyDriveRedirect />} />
        <Route path="/drive/recent" element={<DriveShell />} />
        <Route path="/drive/starred" element={<DriveShell />} />
        <Route path="/drive/trash" element={<DriveShell />} />
        <Route path="/drive/shared-with-me" element={<DriveShell />} />
        <Route path="/drive/shared-drives" element={<DriveShell />} />
        <Route path="/drive/f/:rootId" element={<DriveShell />} />
        <Route path="/drive/file/:fileId" element={<DriveShell />} />
        <Route path="/drive/search" element={<DriveShell />} />
      </Routes>
    </ThemeProvider>
  );
}

function MyDriveRedirect() {
  const d = useQuery({ queryKey: ["drives"], queryFn: driveApi.drives });
  const n = useNavigate();
  const r = d.data?.drives[0]?.rootFolderId;
  useEffect(() => {
    if (r) {
      n(`/drive/f/${r}`, { replace: true });
    }
  }, [n, r]);
  return (
    <div style={{ padding: 24 }}>
      <DriveListSkeleton rows={3} />
    </div>
  );
}
