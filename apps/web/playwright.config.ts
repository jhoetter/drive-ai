import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3500";
const reuse = process.env.CI ? false : !process.env.PLAYWRIGHT_NO_REUSE;
const startStack = process.env.PLAYWRIGHT_START_STACK === "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: startStack
    ? {
        command: "cd ../.. && pnpm run dev",
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: reuse,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL ?? "postgres://driveai:driveai@127.0.0.1:35432/driveai",
          DRIVEAI_PUBLIC_API_URL: process.env.DRIVEAI_PUBLIC_API_URL ?? "http://127.0.0.1:3520",
          PORT: process.env.PORT ?? "3520",
        },
      }
    : undefined,
});
