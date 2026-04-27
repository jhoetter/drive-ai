import { eq, sql } from "drizzle-orm";
import { searchDocuments, type Db } from "@driveai/db";

export async function updateSearchTextBody(db: Db, itemId: string, textBody: string): Promise<void> {
  const [sd] = await db.select().from(searchDocuments).where(eq(searchDocuments.itemId, itemId));
  if (!sd) return;
  await db
    .update(searchDocuments)
    .set({
      textBody,
      searchTsv: sql`to_tsvector('english', coalesce(${sd.name}, '') || ' ' || coalesce(${textBody}, ''))`,
    })
    .where(eq(searchDocuments.itemId, itemId));
}
