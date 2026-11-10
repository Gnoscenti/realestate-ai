import { expect, test } from "@playwright/test";
import { grantTestAccess, resetApp } from "./helpers";

// The test server keeps the beta round open (see playwright.config.ts), so the
// workspace's server grant is a beta-round grant on any date.
test("a beta-round customer whose earlier 30-day window ran out keeps lifetime access", async ({
  page,
}) => {
  await resetApp(page);
  await grantTestAccess(page);

  // Put the browser back in the state an early customer's device is in: the
  // local mirror still carries a 30-day window, and that window has passed.
  const rewritten = await page.evaluate(() => {
    const past = new Date(Date.now() - 5 * 86_400_000).toISOString();
    let count = 0;
    for (const key of Object.keys(localStorage)) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || "null");
        if (!stored?.state?.billing) continue;
        stored.state.billing = {
          ...stored.state.billing,
          status: "trialing",
          source: "stripe_intro",
          introEndsAt: past,
          currentPeriodEnd: past,
          redeemedCode: null,
        };
        localStorage.setItem(key, JSON.stringify(stored));
        count += 1;
      } catch {
        // Not a JSON store entry.
      }
    }
    return count;
  });
  expect(rewritten).toBeGreaterThan(0);

  await page.goto("/billing");

  // The server grant is for life, so the app opens instead of the paywall.
  await expect(page.getByTestId("entitled-workspace")).toBeVisible({ timeout: 20_000 });
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Billing & Access" })).toBeVisible();
  await expect(main.getByText("Lifetime access", { exact: true })).toBeVisible();
  await expect(main.getByTestId("lifetime-access-note")).toContainText("no end date");
  await expect(main).toContainText("You will not be charged for it again");
  await expect(main).not.toContainText("Access ends on");
  await expect(main).not.toContainText("buy another");
  await expect(main.getByText(/\d+ days? left/)).toHaveCount(0);
  await expect(page.locator("#access-code")).toHaveCount(0);

  const mirror = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      try {
        const stored = JSON.parse(localStorage.getItem(key) || "null");
        if (stored?.state?.billing) return stored.state.billing;
      } catch {
        // Not a JSON store entry.
      }
    }
    return null;
  });
  expect(mirror).toMatchObject({ currentPeriodEnd: null, introEndsAt: null });
});
