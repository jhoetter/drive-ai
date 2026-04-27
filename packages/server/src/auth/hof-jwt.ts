import { createHmac, timingSafeEqual } from "node:crypto";

export interface ResolvedIdentity {
  readonly userId: string;
  readonly tenantId: string;
  readonly email?: string;
  readonly displayName?: string;
}

interface JwtClaims {
  readonly iss?: string;
  readonly aud?: string;
  readonly sub?: string;
  readonly tid?: string;
  readonly email?: string;
  readonly displayName?: string;
  readonly exp?: number;
}

const DEV_FALLBACK_SECRET = "dev-only-not-for-prod-9c2f";

function b64urlDecodeToBuffer(input: string): Buffer {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function verify(token: string, secret: Buffer): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("malformed JWT");
  }
  const h = parts[0]!;
  const p = parts[1]!;
  const s = parts[2]!;
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
  const actual = b64urlDecodeToBuffer(s);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("bad signature");
  }
  const claims = JSON.parse(b64urlDecodeToBuffer(p).toString("utf-8")) as JwtClaims;
  if (typeof claims.exp === "number" && claims.exp < Date.now() / 1000) {
    throw new Error("token expired");
  }
  return claims;
}

function extractToken(headers: Record<string, unknown>): string | null {
  const raw = headers["authorization"] ?? headers["Authorization"];
  if (typeof raw !== "string") return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m && m[1] ? m[1].trim() : null;
}

export interface HofJwtIdentityOptions {
  readonly fallback: ResolvedIdentity;
  readonly expectedAudience?: string;
}

function claimsToIdentity(claims: JwtClaims, fallback: ResolvedIdentity): ResolvedIdentity {
  return {
    userId: claims.sub ?? fallback.userId,
    tenantId: claims.tid ?? fallback.tenantId,
    ...(claims.email ? { email: claims.email } : fallback.email ? { email: fallback.email } : {}),
    ...(claims.displayName
      ? { displayName: claims.displayName }
      : fallback.displayName
        ? { displayName: fallback.displayName }
        : {}),
  };
}

export function buildHofJwtIdentity(opts: HofJwtIdentityOptions) {
  const secretEnv = (process.env["HOF_SUBAPP_JWT_SECRET"] ?? "").trim();
  const audience = opts.expectedAudience ?? "driveai";

  return async (req: { headers: Record<string, unknown> }): Promise<ResolvedIdentity> => {
    if (!secretEnv) {
      const token = extractToken(req.headers);
      if (token) {
        try {
          const claims = verify(token, Buffer.from(DEV_FALLBACK_SECRET, "utf-8"));
          if (claims.aud === audience && claims.sub && claims.tid) {
            return claimsToIdentity(claims, opts.fallback);
          }
        } catch {
          // ignore
        }
      }
      return opts.fallback;
    }
    const token = extractToken(req.headers);
    if (!token) {
      const err = new Error("missing bearer token");
      (err as Error & { statusCode?: number }).statusCode = 401;
      throw err;
    }
    let claims: JwtClaims;
    try {
      claims = verify(token, Buffer.from(secretEnv, "utf-8"));
    } catch (cause) {
      const err = new Error(
        `invalid bearer token: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      (err as Error & { statusCode?: number }).statusCode = 401;
      throw err;
    }
    if (claims.aud !== audience) {
      const err = new Error(`token audience ${claims.aud} != ${audience}`);
      (err as Error & { statusCode?: number }).statusCode = 401;
      throw err;
    }
    if (!claims.sub || !claims.tid) {
      const err = new Error("token missing sub/tid claims");
      (err as Error & { statusCode?: number }).statusCode = 401;
      throw err;
    }
    return claimsToIdentity(claims, opts.fallback);
  };
}
