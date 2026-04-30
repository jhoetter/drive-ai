import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DriveBreadcrumbs, DriveListSkeleton, DriveListView, DriveNavItem } from "@driveai/ui";
import { ThemeProvider } from "next-themes";
import { BriefcaseBusiness, Command, FileText, Folder, FolderUp, Home, LayoutGrid, List, Mail, MessageCircle, Upload } from "lucide-react";
import { create } from "zustand";
import { driveApi, type DriveItem, sha256Hex } from "./api";

const HOF_SHELL_SIDEBAR_DEFAULT_WIDTH = 240;
const HOF_SHELL_STORAGE_KEYS = {
  sidebarWidth: "hof-shell-sidebar-width",
  legacySidebarWidth: "hof-sidebar-width",
} as const;

const GLOBAL_APP_LINKS = [
  { id: "os", label: "App", href: "http://localhost:3000/", icon: Home },
  { id: "hofos", label: "hofOS", href: "http://localhost:3600/customers", icon: BriefcaseBusiness },
  { id: "mailai", label: "Mail", href: "http://localhost:3010/inbox", icon: Mail },
  { id: "collabai", label: "Chat", href: "http://localhost:8010/", icon: MessageCircle },
  { id: "driveai", label: "Drive", href: "http://localhost:3520/drive/home", icon: Folder },
  { id: "pagesai", label: "Pages", href: "http://localhost:3399/pages", icon: FileText },
] as const;

function readSidebarWidth(): number {
  try {
    const raw =
      localStorage.getItem(HOF_SHELL_STORAGE_KEYS.sidebarWidth) ??
      localStorage.getItem(HOF_SHELL_STORAGE_KEYS.legacySidebarWidth);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value >= 140 && value <= 480
      ? value
      : HOF_SHELL_SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return HOF_SHELL_SIDEBAR_DEFAULT_WIDTH;
  }
}

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
  const set = usePalette((s) => s.set);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        set({ open: true, query: "" });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [set]);
}

function FileDetailPane(props: { fileId: string; onBack: () => void }) {
  const { t } = useTranslation("trans");
  const itemQ = useQuery({
    queryKey: ["item", props.fileId],
    queryFn: () => driveApi.item(props.fileId),
  });
  const onDownload = async () => {
    const d = await driveApi.download(props.fileId);
    const a = document.createElement("a");
    a.href = d.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.download = d.name;
    a.click();
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
          style={{ marginTop: 8, borderRadius: 8, border: "1px solid var(--dri-border)", padding: "6px 10px" }}
        >
          {t("back")}
        </button>
      </div>
    );
  }
  const it = itemQ.data!.item;
  return (
    <div>
      <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{it.name}</p>
      <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginBottom: 8 }}>
        {it.type} {it.size != null ? ` · ${it.size} B` : ""}
      </p>
      <button
        type="button"
        onClick={() => void onDownload()}
        style={{
          borderRadius: 8,
          border: "1px solid var(--dri-border)",
          padding: "8px 14px",
          background: "var(--dri-surface-1)",
          cursor: "pointer",
        }}
      >
        {t("downloadFile")}
      </button>
    </div>
  );
}

function DriveShell() {
  const { t } = useTranslation("trans");
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { rootId, fileId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const preview = searchParams.get("preview");
  const spQ = searchParams.get("q") || "";
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "grid">("list");
  const { open, query, set } = usePalette();
  useKeyboardPalette();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const staleFolderRedirectRef = useRef(false);
  const lastRouteFolderId = useRef<string | undefined>(undefined);
  const [qLocal, setQLocal] = useState("");
  const sidebarWidth = readSidebarWidth();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const viewMode = driveView(pathname, rootId, fileId);

  useEffect(() => {
    if (viewMode.mode === "search") {
      setQLocal(spQ);
    }
  }, [viewMode.mode, spQ]);

  const drivesQ = useQuery({ queryKey: ["drives"], queryFn: driveApi.drives });
  const root = drivesQ.data?.drives[0];

  const effectiveFolderId: string | undefined =
    viewMode.mode === "folder"
      ? viewMode.folderId
      : viewMode.mode === "myDriveDefault"
        ? root?.rootFolderId ?? undefined
        : undefined;

  const inFolder = viewMode.mode === "folder" || viewMode.mode === "myDriveDefault";

  const childrenQ = useQuery({
    queryKey: ["children", effectiveFolderId],
    queryFn: () => driveApi.children(effectiveFolderId!),
    enabled: inFolder && Boolean(effectiveFolderId),
  });
  const recentQ = useQuery({
    queryKey: ["recent"],
    queryFn: driveApi.recent,
    enabled: viewMode.mode === "recent" || viewMode.mode === "home",
  });
  const starredQ = useQuery({
    queryKey: ["starred"],
    queryFn: driveApi.starred,
    enabled: viewMode.mode === "starred" || viewMode.mode === "home",
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
    enabled: viewMode.mode === "sharedDrives",
  });
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
    const put = await fetch(init.uploadUrl, {
      method: "PUT",
      body: f,
      headers: f.type ? { "content-type": f.type } : {},
    });
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

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
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

  if (drivesQ.isError) {
    const msg = drivesQ.error instanceof Error ? drivesQ.error.message : String(drivesQ.error);
    const looks401 = /(^|\D)401(\D|$)/.test(msg);
    return (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("loadError")}</p>
        <pre
          style={{
            fontSize: 12,
            padding: 12,
            borderRadius: 8,
            background: "var(--dri-surface-1)",
            border: "1px solid var(--dri-border)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {msg}
        </pre>
        <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>{t("apiErrorHint")}</p>
        {looks401 && (
          <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>{t("jwtDevHint")}</p>
        )}
        <button
          type="button"
          onClick={() => void drivesQ.refetch()}
          style={{
            marginTop: 12,
            padding: "8px 14px",
            borderRadius: 8,
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
            <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>{t("apiErrorHint")}</p>
          </div>
        );
      }
    }
    return <div style={{ padding: 24 }}>{t("notConfigured")}</div>;
  }

  const rows: DriveItem[] = (() => {
    if (viewMode.mode === "folder" || viewMode.mode === "myDriveDefault") {
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
        }));
    }
    if (viewMode.mode === "search") {
      return (searchQ.data?.results ?? []).map((r) => ({
        id: r.itemId,
        name: r.name,
        type: r.type,
        size: null,
        snippet: r.snippet,
        locationPath: r.locationPath ?? null,
      }));
    }
    if (viewMode.mode === "home") {
      return [];
    }
    return [];
  })();

  const listLoading = (() => {
    if (viewMode.mode === "home") {
      return recentQ.isLoading || starredQ.isLoading;
    }
    if (viewMode.mode === "folder" || viewMode.mode === "myDriveDefault") {
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
    borderRadius: 999,
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

  const canUpload = inFolder && Boolean(effectiveFolderId);
  const canScopeSearchToFolder = Boolean(effectiveFolderId) && inFolder;

  const p = pathname;
  const inFile = viewMode.mode === "file";
  const isNavHome = !inFile && p === "/drive/home";
  const isNavMyDrive = !inFile && (viewMode.mode === "myDriveDefault" || viewMode.mode === "folder");
  const isNavRecent = !inFile && p === "/drive/recent";
  const isNavStarred = !inFile && p === "/drive/starred";
  const isNavShared = !inFile && p === "/drive/shared-with-me";
  const isNavSharedDrives = !inFile && p === "/drive/shared-drives";
  const isNavTrash = !inFile && p === "/drive/trash";

  const shellToolbar = (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        borderBottom: "1px solid var(--dri-border)",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
        <input
          value={qLocal}
          onChange={(e) => setQLocal(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={String(t("searchPlaceholder"))}
          aria-label={t("searchHint")}
          style={{
            width: "100%",
            minWidth: 0,
            borderRadius: 6,
            border: "1px solid var(--dri-border)",
            padding: 8,
          }}
        />
      </div>
      {canScopeSearchToFolder && (
        <button
          type="button"
          onClick={() => {
            const par = new URLSearchParams();
            par.set("folderId", effectiveFolderId!);
            if (qLocal.trim()) par.set("q", qLocal.trim());
            void nav({ pathname: "/drive/search", search: par.toString() });
          }}
          style={{
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
            whiteSpace: "nowrap",
          }}
        >
          {t("searchInFolder")}
        </button>
      )}
      <button
        type="button"
        onClick={() => set({ open: true, query: "" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          border: "1px solid var(--dri-border)",
          borderRadius: 8,
          padding: "6px 10px",
          background: "var(--dri-surface-1)",
          cursor: "pointer",
          color: "var(--dri-text-muted)",
        }}
      >
        <Command size={16} aria-hidden />
        {t("openPalette")}
      </button>
      {viewMode.mode !== "home" && viewMode.mode !== "file" && (
        <div style={{ display: "flex", border: "1px solid var(--dri-border)", borderRadius: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => setView("list")} style={{ background: "transparent", border: "none" }} aria-pressed={view === "list"}>
            <List size={16} />
          </button>
          <button type="button" onClick={() => setView("grid")} style={{ background: "transparent", border: "none" }} aria-pressed={view === "grid"}>
            <LayoutGrid size={16} />
          </button>
        </div>
      )}
      {preview && <span style={{ color: "var(--dri-text-muted)", fontSize: 12 }}>preview={preview}</span>}
    </header>
  );

  const shellSidebar = (
    <aside
      style={{
        width: sidebarWidth,
        flexShrink: 0,
        borderRight: "1px solid var(--dri-border)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--dri-surface-0)",
      }}
    >
      <div style={{ borderBottom: "1px solid var(--dri-border)", margin: "-12px -12px 8px", padding: 12 }}>
        <Link
          to="/drive/home"
          style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: "var(--dri-text)" }}
        >
          <Folder size={16} aria-hidden />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Drive</span>
        </Link>
        <button
          type="button"
          onClick={() => set({ open: true, query: "" })}
          style={{
            width: "100%",
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            border: "1px solid var(--dri-border)",
            borderRadius: 8,
            padding: "8px 10px",
            background: "var(--dri-surface-1)",
            color: "var(--dri-text-muted)",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          <span>Actions</span>
          <span style={{ fontSize: 10 }}>⌘K</span>
        </button>
      </div>
      <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
      <nav aria-label="Drive" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <DriveNavItem to="/drive/home" active={isNavHome}>
          {t("home")}
        </DriveNavItem>
        <DriveNavItem to="/drive/my-drive" active={isNavMyDrive}>
          {t("myDrive")}
        </DriveNavItem>
        <DriveNavItem to="/drive/recent" active={isNavRecent}>
          {t("recent")}
        </DriveNavItem>
        <DriveNavItem to="/drive/starred" active={isNavStarred}>
          {t("starred")}
        </DriveNavItem>
        <DriveNavItem to="/drive/shared-with-me" active={isNavShared}>
          {t("sharedWithMe")}
        </DriveNavItem>
        <DriveNavItem to="/drive/shared-drives" active={isNavSharedDrives}>
          {t("sharedDrives")}
        </DriveNavItem>
        <DriveNavItem to="/drive/trash" active={isNavTrash}>
          {t("trash")}
        </DriveNavItem>
      </nav>
      {canUpload && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={onFileInputChange} />
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
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              border: "1px solid var(--dri-border)",
              borderRadius: 8,
              padding: "8px 10px",
              background: "var(--dri-surface-1)",
              cursor: uploading ? "default" : "pointer",
              color: "var(--dri-text)",
              fontSize: 14,
            }}
          >
            <Upload size={16} aria-hidden />
            {t("upload")}
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              border: "1px solid var(--dri-border)",
              borderRadius: 8,
              padding: "8px 10px",
              background: "var(--dri-surface-1)",
              cursor: uploading ? "default" : "pointer",
              color: "var(--dri-text)",
              fontSize: 14,
            }}
          >
            <FolderUp size={16} aria-hidden />
            {t("uploadFolder")}
          </button>
        </div>
      )}
      </div>
      <nav
        aria-label="Apps"
        style={{
          borderTop: "1px solid var(--dri-border)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          margin: "8px -12px 0",
          padding: "8px 12px",
        }}
      >
        <p style={{ margin: "4px 0", color: "var(--dri-text-muted)", fontSize: 11, textTransform: "uppercase" }}>Apps</p>
        {GLOBAL_APP_LINKS.map((app) => {
          const Icon = app.icon;
          return (
            <a
              key={app.id}
              href={app.href}
              style={{
                alignItems: "center",
                display: "flex",
                gap: 8,
                textDecoration: "none",
                color: app.id === "driveai" ? "var(--dri-text)" : "var(--dri-text-muted)",
                background: app.id === "driveai" ? "var(--dri-surface-1)" : "transparent",
                borderRadius: 8,
                padding: "6px 8px",
                fontSize: 14,
              }}
            >
              <Icon size={14} aria-hidden />
              <span>{app.label}</span>
            </a>
          );
        })}
      </nav>
      <div
        style={{
          borderTop: "1px solid var(--dri-border)",
          margin: "0 -12px -12px",
          padding: "8px 12px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--dri-text-muted)",
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "var(--dri-text)",
            color: "var(--dri-surface-0)",
            display: "grid",
            placeItems: "center",
            fontWeight: 700,
            fontSize: 11,
          }}
        >
          DR
        </span>
        <span>Drive user</span>
      </div>
    </aside>
  );

  if (viewMode.mode === "file" && fileId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex" }}>
        {shellSidebar}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {shellToolbar}
          <main id="main-content" style={{ flex: 1, padding: 16, overflow: "auto" }} tabIndex={-1}>
            {breadQ.data?.segments && breadQ.data.segments.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <DriveBreadcrumbs
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
        {open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgb(0 0 0 / 0.4)",
              display: "flex",
              alignItems: "start",
              justifyContent: "center",
              paddingTop: 100,
              zIndex: 50,
            }}
            onClick={() => set({ open: false })}
          >
            <div
              style={{
                width: 480,
                background: "var(--dri-surface-0)",
                border: "1px solid var(--dri-border)",
                borderRadius: 12,
                padding: 12,
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Command palette"
            >
              <input
                autoFocus
                value={query}
                onChange={(e) => set({ query: e.target.value })}
                placeholder="Go to, search, actions…"
                style={{ width: "100%", border: "none", background: "transparent", fontSize: 16, outline: "none" }}
              />
              <ul style={{ listStyle: "none", margin: 8, padding: 0, fontSize: 14 }}>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      void nav("/drive/home");
                      set({ open: false });
                    }}
                    style={paletteRowBtn}
                  >
                    {t("home")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      void nav("/drive/my-drive");
                      set({ open: false });
                    }}
                    style={paletteRowBtn}
                  >
                    {t("myDrive")}
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      void nav("/drive/recent");
                      set({ open: false });
                    }}
                    style={paletteRowBtn}
                  >
                    {t("recent")}
                  </button>
                </li>
                {GLOBAL_APP_LINKS.map((app) => (
                  <li key={app.id}>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = app.href;
                        set({ open: false });
                      }}
                      style={paletteRowBtn}
                    >
                      Open {app.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {shellSidebar}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {shellToolbar}
        {uploadError && (
        <div
          style={{
            padding: "8px 16px",
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
            style={{ border: "1px solid var(--dri-border)", borderRadius: 6, padding: "2px 8px", background: "var(--dri-surface-0)" }}
          >
            {t("dismiss")}
          </button>
        </div>
      )}
      {viewMode.mode === "search" && (
        <div
          style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--dri-border)",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--dri-text-muted)" }}>{t("searchFilters")}</span>
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
      <main
        id="main-content"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}
        tabIndex={-1}
      >
        <div style={{ padding: "12px 16px 0 16px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{pageTitle}</h1>
        </div>
        {breadQ.data?.segments && breadQ.data.segments.length > 0 && inFolder && (
          <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--dri-border)" }}>
            <DriveBreadcrumbs
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
        <div
          style={{ flex: 1, padding: 16, overflow: "auto", minHeight: 0 }}
          onDrop={canUpload ? onDrop : undefined}
          onDragOver={canUpload ? (e) => e.preventDefault() : undefined}
        >
        {inFolder && childrenQ.isError && (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, border: "1px solid var(--dri-border)" }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>{t("childrenLoadError")}</p>
            <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginBottom: 8 }}>
              {childrenQ.error instanceof Error ? childrenQ.error.message : String(childrenQ.error)}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void childrenQ.refetch()}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
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
                  borderRadius: 8,
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
        {listLoading && <DriveListSkeleton />}
        {viewMode.mode === "home" && !listLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section aria-labelledby="sec-recent">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <h2 id="sec-recent" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                  {t("recent")}
                </h2>
                <Link
                  to="/drive/recent"
                  style={{ fontSize: 13, color: "var(--dri-primary)", textDecoration: "none" }}
                >
                  {t("viewAll")}
                </Link>
              </div>
              {(recentQ.data?.items ?? []).length === 0 ? (
                <p style={{ color: "var(--dri-text-muted)", fontSize: 14 }}>{t("emptyList")}</p>
              ) : (
                <DriveListView
                  columnHeaders={{ name: t("columnName"), type: t("columnType") }}
                  rows={(recentQ.data?.items ?? []).map((x) => x.item)}
                  onRowOpen={openItem}
                />
              )}
            </section>
            <section aria-labelledby="sec-starred">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 8,
                }}
              >
                <h2 id="sec-starred" style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                  {t("starred")}
                </h2>
                <Link
                  to="/drive/starred"
                  style={{ fontSize: 13, color: "var(--dri-primary)", textDecoration: "none" }}
                >
                  {t("viewAll")}
                </Link>
              </div>
              {(starredQ.data?.items ?? []).length === 0 ? (
                <p style={{ color: "var(--dri-text-muted)", fontSize: 14 }}>{t("emptyList")}</p>
              ) : (
                <DriveListView
                  columnHeaders={{ name: t("columnName"), type: t("columnType") }}
                  rows={(starredQ.data?.items ?? []).map((x) => x.item)}
                  onRowOpen={openItem}
                />
              )}
            </section>
          </div>
        )}
        {!listLoading && rows.length === 0 && viewMode.mode === "search" && !hasSearchCriteria && (
          <p style={{ color: "var(--dri-text-muted)" }}>{t("typeQueryToSearch")}</p>
        )}
        {!listLoading && rows.length === 0 && viewMode.mode === "search" && hasSearchCriteria && (
          <p style={{ color: "var(--dri-text-muted)" }}>{t("noSearchResults")}</p>
        )}
        {!listLoading &&
          rows.length === 0 &&
          (viewMode.mode === "folder" || viewMode.mode === "myDriveDefault") &&
          !childrenQ.isError && (
          <div>
            <p style={{ color: "var(--dri-text-muted)" }}>{t("emptyFolder")}</p>
            {canUpload && (
              <p style={{ color: "var(--dri-text-muted)", fontSize: 14, marginTop: 8 }}>{t("uploadDropHint")}</p>
            )}
          </div>
        )}
        {!listLoading &&
          rows.length === 0 &&
          viewMode.mode !== "search" &&
          !inFolder &&
          viewMode.mode !== "home" && (
            <p style={{ color: "var(--dri-text-muted)" }}>{t("emptyList")}</p>
          )}
        {viewMode.mode !== "home" && view === "list" && rows.length > 0 && (
          <DriveListView
            columnHeaders={{ name: t("columnName"), type: t("columnType") }}
            rows={rows}
            onRowOpen={openItem}
          />
        )}
        {viewMode.mode === "search" && hasSearchCriteria && searchQ.data?.nextOffset != null && rows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => mergeSearch({ offset: String(searchQ.data!.nextOffset) })}
              style={{
                ...chipStyle,
                borderRadius: 8,
              }}
            >
              {t("searchLoadMore")}
            </button>
          </div>
        )}
        {viewMode.mode !== "home" && view === "grid" && rows.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
              gap: 8,
            }}
          >
            {rows.map((r) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => openItem(r)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openItem(r);
                  }
                }}
                style={{
                  border: "1px solid var(--dri-border)",
                  borderRadius: 8,
                  padding: 8,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontWeight: 500 }}>{r.name}</span>
                {r.locationPath ? (
                  <span style={{ display: "block", fontSize: 12, color: "var(--dri-text-muted)", marginTop: 4 }}>
                    {r.locationPath}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
        </div>
      </main>
      </div>
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgb(0 0 0 / 0.4)",
            display: "flex",
            alignItems: "start",
            justifyContent: "center",
            paddingTop: 100,
            zIndex: 50,
          }}
          onClick={() => set({ open: false })}
        >
          <div
            style={{
              width: 480,
              background: "var(--dri-surface-0)",
              border: "1px solid var(--dri-border)",
              borderRadius: 12,
              padding: 12,
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command palette"
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder="Go to, search, actions…"
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                fontSize: 16,
                outline: "none",
              }}
            />
            <ul style={{ listStyle: "none", margin: 8, padding: 0, fontSize: 14 }}>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    void nav("/drive/home");
                    set({ open: false });
                  }}
                  style={paletteRowBtn}
                >
                  {t("home")}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    void nav("/drive/my-drive");
                    set({ open: false });
                  }}
                  style={paletteRowBtn}
                >
                  {t("myDrive")}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    void nav("/drive/recent");
                    set({ open: false });
                  }}
                  style={paletteRowBtn}
                >
                  {t("recent")}
                </button>
              </li>
              {GLOBAL_APP_LINKS.map((app) => (
                <li key={app.id}>
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = app.href;
                      set({ open: false });
                    }}
                    style={paletteRowBtn}
                  >
                    Open {app.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem>
      <Routes>
        <Route
          path="/"
          element={
            <div style={{ padding: 24 }}>
              <Link to="/drive/home">Drive</Link>
            </div>
          }
        />
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
