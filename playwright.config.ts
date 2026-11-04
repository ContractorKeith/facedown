import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/browser",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 90000,
  use: { viewport: { width: 390, height: 844 }, headless: true },
});
