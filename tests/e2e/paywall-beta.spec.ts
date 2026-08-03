import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  readWorkspaceState,
  resetApp,
  unlockWithBetaCode,
} from "./helpers";

test("beta code unlocks app access", async ({ page }) => {
  await resetApp(page);

  await completeOnboarding(page, {
    name: "Beta Tester",
    area: "Del Mar, CA",
  });
  await page.getByRole("button", { name: /Launch workspace/i }).click();
  await page.waitForTimeout(800);

  // Should hit paywall or app — redeem either way
  await unlockWithBetaCode(page, "RSF-BETA-01");

  const state = await readWorkspaceState(page);
  expect(state?.onboarded).toBe(true);

  // After unlock, core nav should be usable
  await expect(
    page.getByText(/Command Center|Action Desk|Unlock/i).first(),
  ).toBeVisible({ timeout: 15_000 });
});
