import type { SearchResponse, SearchFilters } from "@driveai/search";

declare global {
  interface Window {
    __DRIVEAI_API_BASE__?: string;
  }
}

function apiBase(): string {
  if (typeof window !== "undefined") {
    const runtimeBase = window.__DRIVEAI_API_BASE__?.replace(/\/$/, "");
    if (runtimeBase) return runtimeBase;
  }
  const hofosMode = (import.meta as unknown as { env?: { HOFOS_MODE?: boolean } }).env
    ?.HOFOS_MODE;
  return hofosMode ? "/api/drive" : "";
}

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

export type DriveItem = {
  id: string;
  name: string;
  type: string;
  size?: number | null;
  snippet?: string | null;
  locationPath?: string | null;
  s3Key?: string | null;
};

async function commandJson<T>(name: string, payload: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${apiBase()}/api/commands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, payload }),
  });
  const raw = await r.text();
  let body: { ok?: boolean; result?: T; error?: string; code?: string };
  try {
    body = JSON.parse(raw) as { ok?: boolean; result?: T; error?: string; code?: string };
  } catch {
    throw new Error(`${r.status} ${raw}`);
  }
  if (!r.ok || body.ok === false) {
    throw new Error(body.error ?? `${r.status}`);
  }
  return body.result as T;
}

export const driveApi = {
  me: () => j<{ userId: string; tenantId: string }>("/api/me"),
  drives: () => j<{ drives: { id: string; rootFolderId: string | null; name: string; kind?: string }[] }>("/api/drives"),
  children: (
    parentId: string,
    options?: { page?: number; limit?: number; type?: string | null },
  ) => {
    const p = new URLSearchParams();
    if (options?.page != null) p.set("page", String(options.page));
    if (options?.limit != null) p.set("limit", String(options.limit));
    if (options?.type) p.set("type", options.type);
    const q = p.toString();
    return j<{
      items: { item: DriveItem }[];
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    }>(`/api/items/${encodeURIComponent(parentId)}/children${q ? `?${q}` : ""}`);
  },
  recent: () => j<{ items: { item: DriveItem }[] }>("/api/recent"),
  starred: () => j<{ items: { item: DriveItem }[] }>("/api/starred"),
  trashItems: () => j<{ items: { item: DriveItem }[] }>("/api/trash-items"),
  sharedWithMe: () => j<{ items: { item: DriveItem }[] }>("/api/shared-with-me"),
  sharedDrives: () =>
    j<{
      drives: { id: string; name: string; rootFolderId: string | null; kind?: string }[];
    }>("/api/shared-drives"),
  breadcrumb: (itemId: string) =>
    j<{ segments: { id: string; name: string; type: string }[] }>(
      `/api/items/${encodeURIComponent(itemId)}/breadcrumb`,
    ),
  item: (itemId: string) => j<{ item: DriveItem }>(`/api/items/${encodeURIComponent(itemId)}`),
  download: (fileId: string) =>
    j<{ url: string; name: string; contentType: string }>(`/api/items/${encodeURIComponent(fileId)}/download`),
  search: (filters: SearchFilters): Promise<SearchResponse> => {
    const p = new URLSearchParams();
    if (filters.q != null && filters.q !== "") p.set("q", filters.q);
    if (filters.type) p.set("type", filters.type);
    if (filters.owner) p.set("owner", filters.owner);
    if (filters.driveId) p.set("driveId", filters.driveId);
    if (filters.folderId) p.set("folderId", filters.folderId);
    if (filters.modifiedAfter) p.set("modifiedAfter", filters.modifiedAfter);
    if (filters.modifiedBefore) p.set("modifiedBefore", filters.modifiedBefore);
    if (filters.label) p.set("label", filters.label);
    if (filters.trash) p.set("trash", "true");
    if (filters.limit != null) p.set("limit", String(filters.limit));
    if (filters.offset != null) p.set("offset", String(filters.offset));
    return j<SearchResponse>(`/api/search?${p.toString()}`);
  },
  initUpload: (body: {
    parentId: string;
    name: string;
    contentType: string;
    size: number;
  }) =>
    j<{ fileId: string; uploadUrl: string; proxyUploadUrl?: string; s3Key: string }>("/api/uploads", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  uploadBytes: (upload: { proxyUploadUrl?: string; s3Key: string }, file: File) => {
    const proxyPath =
      upload.proxyUploadUrl ?? `/api/blobs/put?key=${encodeURIComponent(upload.s3Key)}`;
    return fetch(`${apiBase()}${proxyPath}`, {
      method: "PUT",
      body: file,
      headers: { "content-type": file.type || "application/octet-stream" },
    });
  },
  completeUpload: (body: {
    fileId: string;
    sha256: string;
    size: number;
    contentType: string;
  }) =>
    j<{ complete: boolean }>("/api/uploads/complete", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  abandonUpload: (body: { fileId: string }) =>
    j<{ abandoned: boolean }>("/api/uploads/abandon", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Typed command dispatch (see packages/server command-dispatch). */
  folderEnsurePath: (parentId: string, segments: string[]) =>
    commandJson<{ folderId: string }>("folder:ensurePath", { parentId, segments }),
};

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type { SearchResponse, SearchFilters, SearchHit } from "@driveai/search";
