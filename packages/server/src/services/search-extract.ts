import { desc, eq, and, isNull } from "drizzle-orm";
import { fileBlobs, items, drives, type Db } from "@driveai/db";
import { PDFParse } from "pdf-parse";
import type { AppDeps } from "../deps.js";
import { updateSearchTextBody } from "./search-index-update.js";

const MAX_EXTRACT = 500_000;

function shouldExtractMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  if (mime.startsWith("text/")) return true;
  if (mime === "application/pdf") return true;
  return false;
}

/**
 * Best-effort async extraction after upload; failures are logged, filename search still works.
 */
export function maybeEnqueueSearchExtraction(db: Db, deps: AppDeps, itemId: string): void {
  setImmediate(() => {
    void extractAndIndexFile(db, deps, itemId).catch((err) => {
      console.warn(`drive-ai: search extract failed for ${itemId}`, err);
    });
  });
}

export async function extractAndIndexFile(db: Db, deps: AppDeps, itemId: string): Promise<void> {
  const [it] = await db.select().from(items).where(eq(items.id, itemId));
  if (!it || it.type !== "file" || it.trashedAt) return;
  if (!shouldExtractMime(it.mime)) return;

  const [fb] = await db
    .select()
    .from(fileBlobs)
    .where(eq(fileBlobs.itemId, itemId))
    .orderBy(desc(fileBlobs.version))
    .limit(1);
  if (!fb) return;

  const buf = await deps.blob.getObjectBytes(fb.s3Key);
  const mime = it.mime ?? "application/octet-stream";

  let text = "";
  if (mime.startsWith("text/")) {
    text = buf.toString("utf8");
  } else if (mime === "application/pdf") {
    const parser = new PDFParse({ data: buf });
    try {
      const tr = await parser.getText();
      text = tr.text;
    } finally {
      await parser.destroy();
    }
  }

  text = text.slice(0, MAX_EXTRACT);
  await updateSearchTextBody(db, itemId, text);
}

/**
 * Reindex file items in a tenant (capped) — for dev / maintenance.
 */
export async function reindexExtractableInTenant(
  db: Db,
  deps: AppDeps,
  tenantId: string,
  cap: number = 200,
): Promise<{ processed: number; errors: number }> {
  const rows = await db
    .select({ id: items.id })
    .from(items)
    .innerJoin(drives, eq(items.driveId, drives.id))
    .where(
      and(
        eq(drives.tenantId, tenantId),
        eq(items.type, "file"),
        isNull(items.trashedAt),
      )!,
    )
    .limit(cap);

  let processed = 0;
  let errors = 0;
  for (const r of rows) {
    try {
      await extractAndIndexFile(db, deps, r.id);
      processed++;
    } catch {
      errors++;
    }
  }
  return { processed, errors };
}
