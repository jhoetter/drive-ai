/**
 * Headless TypeScript client for drive-ai (HTTP + optional MCP on server).
 * Same contract as the web UI: always call /api/* on the same origin.
 */
const defaultBase = "http://127.0.0.1:3520";

export function createDriveAiClient(baseUrl: string = process.env.DRIVEAI_API_URL ?? defaultBase) {
  const b = baseUrl.replace(/\/$/, "");
  return {
    async me() {
      const r = await fetch(`${b}/api/me`, { headers: { accept: "application/json" } });
      return (await r.json()) as { userId: string; tenantId: string; email: string | null };
    },
    async listDrives() {
      const r = await fetch(`${b}/api/drives`, { headers: { accept: "application/json" } });
      return (await r.json()) as { drives: unknown[] };
    },
    async listChildren(parentId: string) {
      const r = await fetch(`${b}/api/items/${encodeURIComponent(parentId)}/children`, {
        headers: { accept: "application/json" },
      });
      return (await r.json()) as { items: { item: unknown }[] };
    },
  };
}
