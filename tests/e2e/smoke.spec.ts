import { test, expect } from "@playwright/test";

test("home loads with visible content and no page errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err.message || err)));

  const res = await page.goto("/", { waitUntil: "networkidle" });
  expect(res?.ok() || res?.status() === 200).toBeTruthy();

  const body = await page.locator("body").innerText();
  expect(body.trim().length).toBeGreaterThan(40);
  expect(pageErrors).toEqual([]);
});

test("mobile viewport has no catastrophic overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  const clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  // Allow 8px tolerance for scrollbars
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 8);
});
