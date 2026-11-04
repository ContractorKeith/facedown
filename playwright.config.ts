import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/browser",
  testMatch: "**/*.spec.ts",
  workers: 2,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  timeout: 90000,
  use: { viewport: { width: 390, height: 844 }, headless: true },
});
