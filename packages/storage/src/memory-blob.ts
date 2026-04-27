import { createHash } from "node:crypto";

/** In-memory store for local dev and tests. */
export function createMemoryBlobStore() {
  const m = new Map<string, Buffer>();
  return {
    async putObject(key: string, body: Buffer, _contentType: string) {
      m.set(key, body);
      return { key, size: body.length, sha256: createHash("sha256").update(body).digest("hex") };
    },
    async getObjectBytes(key: string): Promise<Buffer> {
      const b = m.get(key);
      if (!b) throw new Error(`no object ${key}`);
      return b;
    },
    async deleteObject(key: string) {
      m.delete(key);
    },
    async presignPut(key: string, _contentType: string) {
      const base = (process.env.DRIVEAI_PUBLIC_API_URL ?? "http://127.0.0.1:3520").replace(
        /\/$/,
        "",
      );
      return `${base}/api/blobs/put?key=${encodeURIComponent(key)}`;
    },
    async presignGet(key: string) {
      const base = (process.env.DRIVEAI_PUBLIC_API_URL ?? "http://127.0.0.1:3520").replace(
        /\/$/,
        "",
      );
      return `${base}/api/blobs/get?key=${encodeURIComponent(key)}`;
    },
  };
}

export type MemoryBlobStore = ReturnType<typeof createMemoryBlobStore>;
