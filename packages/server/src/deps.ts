import type { Db } from "@driveai/db";
import type { buildHofJwtIdentity } from "./auth/hof-jwt.js";
import type { EventHub } from "./realtime/hub.js";

export interface BlobStoreLike {
  putObject: (key: string, body: Buffer, contentType: string) => Promise<unknown>;
  getObjectBytes: (key: string) => Promise<Buffer>;
  deleteObject?: (key: string) => Promise<void>;
  presignPut: (key: string, contentType: string) => Promise<string>;
  presignGet: (key: string) => Promise<string>;
}

export interface AppDeps {
  db: Db;
  closeDb: () => Promise<void>;
  identity: ReturnType<typeof buildHofJwtIdentity>;
  blob: BlobStoreLike;
  events: EventHub;
}

export type { Db };
