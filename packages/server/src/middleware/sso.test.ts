import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

import { __testInternals } from "./sso.js";

const { exchangeHandoffCode, verifyHandoffJwt } = __testInternals;

function b64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeToken(secret: string, claims: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  const sig = b64url(
    createHmac("sha256", Buffer.from(secret, "utf-8")).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

describe("SSO handoff verifier", () => {
  beforeEach(() => {
    delete process.env["HOF_SUBAPP_JWT_SECRET"];
    delete process.env["HOF_SUBAPP_JWT_SECRET_PREVIOUS"];
  });

  afterEach(() => {
    delete process.env["HOF_SUBAPP_JWT_SECRET"];
    delete process.env["HOF_SUBAPP_JWT_SECRET_PREVIOUS"];
    delete process.env["HOF_DATA_APP_INTERNAL_URL"];
    delete process.env["HOF_DATA_APP_PUBLIC_URL"];
    delete process.env["HOF_OS_PUBLIC_URL"];
    vi.unstubAllGlobals();
  });

  it("accepts a JWT minted by hof-os with the matching secret", () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "shared-secret";
    const token = makeToken("shared-secret", {
      aud: "driveai",
      sub: "user-1",
      tid: "tenant-x",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const claims = verifyHandoffJwt(token);
    expect(claims).not.toBeNull();
    expect(claims?.aud).toBe("driveai");
    expect(claims?.sub).toBe("user-1");
    expect(claims?.tid).toBe("tenant-x");
  });

  it("accepts the previous secret during rotation", () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "new-secret";
    process.env["HOF_SUBAPP_JWT_SECRET_PREVIOUS"] = "old-secret";
    const oldToken = makeToken("old-secret", {
      aud: "driveai",
      sub: "user-1",
      tid: "tenant-x",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(verifyHandoffJwt(oldToken)).not.toBeNull();
  });

  it("rejects tokens for the wrong audience", () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "shared-secret";
    const token = makeToken("shared-secret", {
      aud: "mailai",
      sub: "user-1",
      tid: "tenant-x",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(verifyHandoffJwt(token)).toBeNull();
  });

  it("rejects tokens with a tampered signature", () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "shared-secret";
    const token = makeToken("shared-secret", {
      aud: "driveai",
      sub: "user-1",
      tid: "tenant-x",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const [h, p, s] = token.split(".");
    const flipped = (s![0] === "A" ? "B" : "A") + s!.slice(1);
    expect(verifyHandoffJwt(`${h}.${p}.${flipped}`)).toBeNull();
  });

  it("rejects expired tokens", () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "shared-secret";
    const token = makeToken("shared-secret", {
      aud: "driveai",
      sub: "user-1",
      tid: "tenant-x",
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    expect(verifyHandoffJwt(token)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "shared-secret";
    expect(verifyHandoffJwt("not-a-jwt")).toBeNull();
    expect(verifyHandoffJwt("a.b")).toBeNull();
  });

  it("falls back to the dev secret when no env is set", () => {
    const token = makeToken("dev-only-not-for-prod-9c2f", {
      aud: "driveai",
      sub: "user-1",
      tid: "tenant-x",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    expect(verifyHandoffJwt(token)).not.toBeNull();
  });

  it("exchanges opaque handoff codes through hof-os", async () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "shared-secret";
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = makeToken("shared-secret", {
      aud: "driveai",
      sub: "user-1",
      tid: "tenant-x",
      exp,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        audience: "driveai",
        token,
        expires_at: new Date(exp * 1000).toISOString(),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const exchanged = await exchangeHandoffCode("opaque-code");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/subapp-handoff/exchange",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ audience: "driveai", code: "opaque-code" }),
      }),
    );
    expect(exchanged?.token).toBe(token);
    expect(exchanged?.maxAgeSeconds).toBeGreaterThan(0);
    expect(exchanged?.maxAgeSeconds).toBeLessThanOrEqual(60);
  });

  it("prefers the internal hofOS URL for server-side handoff exchange", async () => {
    process.env["HOF_SUBAPP_JWT_SECRET"] = "shared-secret";
    process.env["HOF_DATA_APP_INTERNAL_URL"] = "http://host.docker.internal:3000/";
    process.env["HOF_DATA_APP_PUBLIC_URL"] = "https://app.example.test";
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = makeToken("shared-secret", {
      aud: "driveai",
      sub: "user-1",
      tid: "tenant-x",
      exp,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        audience: "driveai",
        token,
        expires_at: new Date(exp * 1000).toISOString(),
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await exchangeHandoffCode("opaque-code");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://host.docker.internal:3000/api/subapp-handoff/exchange",
      expect.any(Object),
    );
  });
});
