#!/usr/bin/env node
import { program } from "commander";
import { ExitCode, toCliJsonError, DriveAiError } from "@driveai/core";

const api = (process.env.DRIVEAI_API_URL ?? "http://127.0.0.1:3520").replace(/\/$/, "");

function authHeaders() {
  return {
    "content-type": "application/json",
    // Dev path: hofOS sets Bearer; in dev, server accepts fallback identity
  } as Record<string, string>;
}

async function jfetch(path: string, init?: RequestInit) {
  const r = await fetch(`${api}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...init?.headers } as Record<string, string>,
  });
  const text = await r.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!r.ok) {
    const e = new DriveAiError(
      (body as { error?: { message?: string } })?.error?.message ?? r.statusText,
      "http",
      r.status === 401 ? ExitCode.Auth : ExitCode.UserError,
    );
    throw e;
  }
  return body;
}

const jsonOut = (data: unknown) => {
  console.log(JSON.stringify(data, null, 2));
};

program
  .name("drive-ai")
  .option("--format <f>", "json|table", "json");

const auth = program.command("auth");
auth
  .command("whoami")
  .action(async () => {
    const me = (await jfetch("/api/me")) as object;
    jsonOut(me);
  });

const drive = program.command("drive");
drive
  .command("list")
  .action(async () => {
    const d = (await jfetch("/api/drives")) as { drives: unknown[] };
    jsonOut(d.drives);
  });

const file = program.command("file");
file
  .command("list")
  .requiredOption("--folder <id>", "parent folder id (root of Your Drive from /api/drives)")
  .action(async (opts) => {
    const out = (await jfetch(`/api/items/${encodeURIComponent(opts.folder)}/children`)) as {
      items: unknown[];
    };
    jsonOut(out.items);
  });
file
  .command("rename")
  .argument("<id>")
  .argument("<name>")
  .action(() => {
    console.error("Use POST /api/commands name=file:rename when implemented");
    process.exit(ExitCode.UserError);
  });
file
  .command("trash")
  .argument("<id>")
  .action(async (id) => {
    const res = (await jfetch("/api/commands", {
      method: "POST",
      body: JSON.stringify({ name: "file:trash", payload: { id } }),
    })) as { ok: boolean };
    jsonOut(res);
  });
file
  .command("restore")
  .argument("<id>")
  .action(async (id) => {
    const res = (await jfetch("/api/commands", {
      method: "POST",
      body: JSON.stringify({ name: "file:restore", payload: { id } }),
    })) as { ok: boolean };
    jsonOut(res);
  });

const folder = program.command("folder");
folder
  .command("create")
  .requiredOption("--parent <id>")
  .requiredOption("--name <n>")
  .action(async (opts) => {
    const res = (await jfetch("/api/commands", {
      method: "POST",
      body: JSON.stringify({
        name: "folder:create",
        payload: { parentId: opts.parent, name: opts.name },
      }),
    })) as { result: unknown };
    jsonOut(res);
  });

program
  .command("upload")
  .argument("<path>", "file path to upload (small files, dev only)")
  .requiredOption("--parent <id>", "folder id")
  .action(async (path, opts: { parent: string }) => {
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(path);
    const name = path.split("/").pop() ?? "file";
    const init = (await jfetch("/api/uploads", {
      method: "POST",
      body: JSON.stringify({
        parentId: opts.parent,
        name,
        contentType: "application/octet-stream",
        size: buf.length,
      }),
    })) as { fileId: string; uploadUrl: string };
    const put = await fetch(init.uploadUrl, {
      method: "PUT",
      body: buf,
      headers: { "content-type": "application/octet-stream" },
    });
    if (!put.ok) throw new Error(`put failed ${put.status}`);
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(buf).digest("hex");
    const done = (await jfetch("/api/uploads/complete", {
      method: "POST",
      body: JSON.stringify({
        fileId: init.fileId,
        sha256: sha,
        size: buf.length,
        contentType: "application/octet-stream",
      }),
    })) as object;
    jsonOut(done);
  });

program
  .command("download")
  .argument("<fileId>")
  .requiredOption("--output <path>")
  .action(() => {
    console.error("Use GET /api/blobs for presigned path when wired");
    process.exit(ExitCode.UserError);
  });

program
  .command("search")
  .argument("[q]", "search text (optional if filters are set)")
  .option("--type <mime>", "filter by MIME substring (e.g. pdf, image)")
  .option("--owner <id>", "owner user id, or 'me'")
  .option("--drive-id <id>", "scope to drive")
  .option("--folder-id <id>", "scope to folder and descendants")
  .option("--modified-after <iso>", "items updated after (ISO-8601)")
  .option("--modified-before <iso>", "items updated before (ISO-8601)")
  .option("--label <k=v>", "label key=value")
  .option("--trash", "search trashed items only")
  .option("--limit <n>", "max results", "50")
  .option("--offset <n>", "pagination offset", "0")
  .action(
    async (
      q: string | undefined,
      opts: {
        type?: string;
        owner?: string;
        driveId?: string;
        folderId?: string;
        modifiedAfter?: string;
        modifiedBefore?: string;
        label?: string;
        trash?: boolean | string;
        limit?: string;
        offset?: string;
      },
    ) => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (opts.type) p.set("type", opts.type);
      if (opts.owner) p.set("owner", opts.owner);
      if (opts.driveId) p.set("driveId", opts.driveId);
      if (opts.folderId) p.set("folderId", opts.folderId);
      if (opts.modifiedAfter) p.set("modifiedAfter", opts.modifiedAfter);
      if (opts.modifiedBefore) p.set("modifiedBefore", opts.modifiedBefore);
      if (opts.label) p.set("label", opts.label);
      if (opts.trash) p.set("trash", "true");
      if (opts.limit) p.set("limit", opts.limit);
      if (opts.offset) p.set("offset", opts.offset);
      const hasAny =
        Boolean(q?.trim()) ||
        Boolean(opts.type) ||
        Boolean(opts.owner) ||
        Boolean(opts.driveId) ||
        Boolean(opts.folderId) ||
        Boolean(opts.modifiedAfter) ||
        Boolean(opts.modifiedBefore) ||
        Boolean(opts.label) ||
        Boolean(opts.trash);
      if (!hasAny) {
        console.error("Provide a search term and/or filters (see --help).");
        process.exit(ExitCode.UserError);
      }
      const out = (await jfetch(`/api/search?${p.toString()}`)) as object;
      jsonOut(out);
    },
  );

const perm = program.command("permission");
perm
  .command("list")
  .argument("<fileId>")
  .action(async (fileId) => {
    const out = (await jfetch(`/api/items/${encodeURIComponent(fileId)}/permissions`)) as object;
    jsonOut(out);
  });
perm
  .command("grant")
  .requiredOption("--user <u>")
  .requiredOption("--role <r>")
  .argument("<fileId>")
  .action(async (fileId, o: { user: string; role: string }) => {
    const res = (await jfetch("/api/commands", {
      method: "POST",
      body: JSON.stringify({
        name: "permission:grant",
        payload: { fileId, userId: o.user, role: o.role },
      }),
    })) as object;
    jsonOut(res);
  });

void program.parseAsync().catch((e) => {
  const { error, exitCode } = toCliJsonError(e);
  console.error(JSON.stringify({ error, exitCode }, null, 2));
  process.exit(exitCode);
});
