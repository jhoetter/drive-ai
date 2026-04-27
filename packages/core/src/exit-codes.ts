/** drive-ai CLI exit codes (per product prompt). */
export const ExitCode = {
  Success: 0,
  UserError: 1,
  Auth: 2,
  Network: 3,
  Conflict: 4,
  PermissionDenied: 5,
  RateLimited: 6,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
