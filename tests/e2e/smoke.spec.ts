import { test, expect } from "@playwright/test";

test("home loads with visible content and no page errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) =>
    pageErrors.push(String(error.message || error)),
  );

  const response = await page.goto("/", { waitUntil: "networkidle" });
  expect(response?.ok() || response?.status() === 200).toBeTruthy();

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
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 8);
});

test("auth session endpoint returns JSON rather than app HTML", async ({
  request,
}) => {
  const response = await request.get("/api/auth/get-session");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");
  const body = await response.text();
  expect(body).not.toMatch(/<!doctype|Set up your Agent OS/i);
});
