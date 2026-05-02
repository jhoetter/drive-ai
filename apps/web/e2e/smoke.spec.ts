import { test, expect } from "@playwright/test";

test.use({ locale: "en-US" });

test.describe("dev harness (start stack: make dev, or set PLAYWRIGHT_START_STACK=1)", () => {
  test("loads /drive: header with Drive, or not-configured if API is down", async ({ page }) => {
    await page.goto("/drive", { waitUntil: "domcontentloaded" });
    const loading = page.getByText("…");
    if (await loading.isVisible().catch(() => false)) {
      await expect(loading).toBeHidden({ timeout: 120_000 });
    }
    const notConfigured = page.getByText("Not configured");
    if (await notConfigured.isVisible().catch(() => false)) {
      await expect(notConfigured).toBeVisible();
      return;
    }
    const header = page.getByRole("banner");
    await expect(header).toBeVisible();
    await expect(header.getByText("Drive", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "My Drive" })).toBeVisible();
  });

  test("command palette opens from header button", async ({ page }, testInfo) => {
    await page.goto("/drive", { waitUntil: "domcontentloaded" });
    const loading = page.getByText("…");
    if (await loading.isVisible().catch(() => false)) {
      await expect(loading).toBeHidden({ timeout: 120_000 });
    }
    const notConfigured = page.getByText("Not configured");
    if (await notConfigured.isVisible().catch(() => false)) {
      testInfo.skip(true, "API not reachable; run make dev for full flow");
    }
    await page.getByRole("button", { name: /Command palette/ }).click();
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  });

  test("deep file route does not get blocked by drive bootstrap", async ({ page }) => {
    await page.route("**/api/drives", (route) => route.fulfill({ status: 401, body: "missing session" }));
    await page.route("**/api/items/file_missing", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          item: { id: "file_missing", name: "Deep linked file", type: "document", size: 12 },
        }),
      }),
    );
    await page.goto("/drive/file/file_missing", { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Could not load Drive")).toHaveCount(0);
    await expect(page.getByText("Deep linked file")).toBeVisible();
  });
});
