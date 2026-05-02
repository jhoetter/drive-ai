import { and, desc, inArray, ne } from "drizzle-orm";
import { fileBlobs, type Db } from "@driveai/db";

/** Latest resolved blob S3 keys per item (excludes pending uploads). */
export async function latestBlobKeysForItems(db: Db, itemIds: string[]): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db
    .select({
      itemId: fileBlobs.itemId,
      s3Key: fileBlobs.s3Key,
      version: fileBlobs.version,
    })
    .from(fileBlobs)
    .where(and(inArray(fileBlobs.itemId, itemIds), ne(fileBlobs.sha256, "pending"))!)
    .orderBy(desc(fileBlobs.version));
  const keys = new Map<string, string>();
  for (const row of rows) {
    if (!keys.has(row.itemId)) keys.set(row.itemId, row.s3Key);
  }
  return keys;
}
