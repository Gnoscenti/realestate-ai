import { expect, test } from "@playwright/test";
import { grantTestAccess, resetApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
});

test("CiteLock is reachable and distinguishes readiness from recognition", async ({ page }) => {
  const link = page.getByRole("link", { name: "CiteLock", exact: true });
  await expect(link).toBeVisible();
  await link.click();

  await expect(page).toHaveURL(/\/aieo\/?$/);
  await expect(
    page.getByRole("heading", {
      name: "Lock the Realtor, brokerage, market, and evidence into one citable graph",
    }),
  ).toBeVisible();
  await expect(page.getByText("CiteScore readiness", { exact: true })).toBeVisible();
  await expect(page.getByText("Not measured", { exact: true })).toBeVisible();
  await expect(page.getByText("No valid canonical public profile URL.")).toBeVisible();

  await page.getByRole("button", { name: "Recognition", exact: true }).click();
  await expect(page.getByText("Recognition is not measured", { exact: true })).toBeVisible();
  await expect(page.getByText(/CiteScore is not an LLM ranking/)).toBeVisible();

  await page.getByRole("button", { name: "Evidence Locker", exact: true }).click();
  await expect(page.getByText("license", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true }).first()).toBeVisible();
});
