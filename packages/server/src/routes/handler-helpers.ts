import type { FastifyReply, FastifyRequest } from "fastify";
import type { ResolvedIdentity } from "../auth/hof-jwt.js";
import { DriveAiError, ExitCode } from "@driveai/core";

export function jsonErr(
  reply: FastifyReply,
  err: unknown,
  status: number,
  code: string,
) {
  const message = err instanceof Error ? err.message : String(err);
  return reply
    .status(status)
    .send({ error: { code, message } });
}

export function requireId(req: FastifyRequest): ResolvedIdentity {
  return (req as FastifyRequest & { identity: ResolvedIdentity }).identity;
}

export function toHttpStatus(err: unknown): number {
  if (err instanceof DriveAiError) {
    if (err.exitCode === ExitCode.Auth) return 401;
    if (err.exitCode === ExitCode.PermissionDenied) return 403;
    if (err.exitCode === ExitCode.Conflict) return 409;
  }
  const se = err as { statusCode?: number };
  if (typeof se.statusCode === "number") return se.statusCode;
  return 500;
}
