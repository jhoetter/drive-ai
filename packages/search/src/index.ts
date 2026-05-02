/** Search filter DTOs shared with API, web, and CLI. */
export interface SearchFilters {
  q?: string;
  type?: string;
  owner?: string;
  /** Scope to a drive. */
  driveId?: string;
  /** Scope to a folder and all descendants. */
  folderId?: string;
  modifiedAfter?: string;
  modifiedBefore?: string;
  /** `key=value` (label def key and value). */
  label?: string;
  /** Search trashed items only. */
  trash?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchHit {
  itemId: string;
  name: string;
  mime: string | null;
  ownerId: string;
  type: string;
  updatedAt: string;
  driveId: string;
  parentId: string | null;
  rank: number;
  match: "name" | "content" | "metadata";
  snippet: string | null;
  /** Breadcrumb from root, excluding this item. */
  locationPath?: string;
  /** Per-user star from user_item_state. */
  starred?: boolean;
}

export interface SearchResponse {
  results: SearchHit[];
  nextOffset: number | null;
}
