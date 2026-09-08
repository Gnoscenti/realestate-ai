import { expect, test } from "@playwright/test";
import { grantTestAccess, resetApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
});

test("CiteLock explains what it measures and asks for a profile before running anything", async ({ page }) => {
  const link = page.getByRole("link", { name: "CiteLock", exact: true });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/aieo\/?$/);
  await expect(
    page.getByRole("heading", {
      name: /See where AI answers send your clients/,
    }),
  ).toBeVisible();
  // No profile yet: the page asks for setup instead of running a paid batch.
  await expect(page.getByText("Set up your profile to start")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open profile setup" })).toBeVisible();

  await page.getByRole("button", { name: "Where you show up", exact: true }).click();
  await expect(page.getByText(/No visibility batch yet/)).toBeVisible();

  await page.getByRole("button", { name: "What to fix", exact: true }).click();
  await expect(page.getByText("Run a visibility batch first.")).toBeVisible();

  await page.getByRole("button", { name: "Readiness", exact: true }).click();
  await expect(page.getByText("CiteScore readiness", { exact: true })).toBeVisible();
  await expect(page.locator("#citelock-jurisdiction")).toHaveValue("US-CA");
  await expect(page.getByRole("button", { name: "Run verified scan" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy schema" })).toBeDisabled();
  await expect(page.getByText(/Complete every publishing gate/)).toBeVisible();

  await page.getByRole("button", { name: "Evidence locker", exact: true }).click();
  await expect(page.getByText("license", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true }).first()).toBeVisible();
});

test("Social desk loads from the server with truthful empty states", async ({ page }) => {
  await page.getByRole("link", { name: "Social Desk", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/?$/);
  await expect(page.getByRole("heading", { name: /Draft from facts/ })).toBeVisible();
  await expect(page.getByText(/No drafts yet/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Connect and list channels/ })).toBeDisabled();

  // Compose a draft without AI, save it, approve it, hand it off.
  await page.locator("#social-facts").fill("Open house Saturday 1-3 PM (I set this)");
  await page.locator("#social-title").fill("Open house test");
  await page.locator("#social-caption").fill("Open house Saturday 1-3 PM at my listing. Message me for the address.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Editing rev 1")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Approve facts, rights, and text/ }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Manual handoff")).toBeVisible();
  await page.getByRole("button", { name: "I'll post this myself" }).click();
  await expect(page.locator("#social-receipt")).toBeVisible({ timeout: 15_000 });
  await page.locator("#social-receipt").fill("https://www.instagram.com/p/abc123/");
  await page.getByRole("button", { name: "Record receipt" }).click();
  await expect(page.getByText("Posted (reported)").first()).toBeVisible({ timeout: 15_000 });
});
