import type { ExitCode } from "./exit-codes.js";
import { ExitCode as E } from "./exit-codes.js";

export class DriveAiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly exitCode: ExitCode = E.UserError,
  ) {
    super(message);
    this.name = "DriveAiError";
  }
}

export function toCliJsonError(err: unknown) {
  if (err instanceof DriveAiError) {
    return { error: { message: err.message, code: err.code }, exitCode: err.exitCode };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { error: { message, code: "internal" }, exitCode: E.UserError };
}
