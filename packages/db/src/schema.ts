import {
  bigserial,
  boolean,
  bigint,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/** PostgreSQL `tsvector` for full-text search. */
const tsvector = customType<{ data: unknown }>({
  dataType() {
    return "tsvector";
  },
});

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const drives = pgTable(
  "drives",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().$type<"personal" | "shared">(),
    name: text("name").notNull(),
    rootFolderId: text("root_folder_id"),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("drives_tenant_idx").on(t.tenantId)],
);

export const items = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    driveId: text("drive_id")
      .notNull()
      .references(() => drives.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    type: text("type")
      .notNull()
      .$type<"file" | "folder" | "shortcut" | "external" | "generated">(),
    name: text("name").notNull(),
    mime: text("mime"),
    size: bigint("size", { mode: "number" }),
    extension: text("extension"),
    shortcutTargetId: text("shortcut_target_id"),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    trashedBy: text("trashed_by"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    customProperties: jsonb("custom_properties").$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    index("items_drive_parent_idx").on(t.driveId, t.parentId),
    index("items_name_idx").on(t.driveId, t.parentId, t.name),
  ],
);

export const fileBlobs = pgTable("file_blobs", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  sha256: text("sha256").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  contentType: text("content_type").notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userItemState = pgTable(
  "user_item_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    starred: boolean("starred").notNull().default(false),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    hidden: boolean("hidden").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
  },
  (t) => [uniqueIndex("user_item_state_pk").on(t.userId, t.itemId)],
);

export const permissionGrants = pgTable("permission_grants", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  granteeType: text("grantee_type")
    .notNull()
    .$type<"user" | "group" | "domain" | "anyone" | "agent">(),
  granteeId: text("grantee_id"),
  role: text("role")
    .notNull()
    .$type<"owner" | "organizer" | "fileOrganizer" | "writer" | "commenter" | "reader">(),
  inherit: boolean("inherit").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shareLinks = pgTable("share_links", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  role: text("role")
    .notNull()
    .$type<"reader" | "commenter" | "writer">(),
  discoverable: boolean("discoverable").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessRequests = pgTable("access_requests", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  requesterId: text("requester_id")
    .notNull()
    .references(() => users.id),
  message: text("message").notNull().default(""),
  status: text("status")
    .notNull()
    .$type<"pending" | "approved" | "denied">()
    .default("pending"),
  grantedRole: text("granted_role").$type<
    "reader" | "commenter" | "writer" | null
  >(),
  resolvedBy: text("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityEvents = pgTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("activity_ts_idx").on(t.tenantId, t.ts), index("activity_item_idx").on(t.itemId)],
);

export const changeLog = pgTable(
  "change_log",
  {
    cursor: bigserial("cursor", { mode: "number" }).notNull().primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    op: text("op").notNull(),
    entityId: text("entity_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("change_tenant_cursor").on(t.tenantId, t.cursor)],
);

export const searchDocuments = pgTable(
  "search_documents",
  {
    itemId: text("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime"),
    textBody: text("text_body").default(""),
    /** Combined name + text_body, maintained by `recordSearch` and extraction. */
    searchTsv: tsvector("search_tsv"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => [
    index("search_tenant_name").on(t.tenantId, t.name),
    index("search_doc_tsv_gin").using("gin", t.searchTsv),
  ],
);

export const labelDefs = pgTable("label_defs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(),
  color: text("color"),
});

export const itemLabels = pgTable(
  "item_labels",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labelDefs.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("item_label_uq").on(t.itemId, t.labelId)],
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    fileId: text("file_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("comments_file_idx").on(t.fileId)],
);

export const agentProposals = pgTable("agent_proposals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull().$type<"pending" | "approved" | "rejected">().default("pending"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itemsRelations = relations(items, ({ one, many }) => ({
  drive: one(drives, { fields: [items.driveId], references: [drives.id] }),
  fileBlobs: many(fileBlobs),
}));

export const drivesRelations = relations(drives, ({ many }) => ({
  items: many(items),
}));
