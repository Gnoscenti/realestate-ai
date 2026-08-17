import { test, expect } from "@playwright/test";
import { readWorkspaceState, resetApp, grantTestAccess } from "./helpers";

test("the access gate opens the app without forcing profile setup", async ({ page }) => {
  await resetApp(page);

  await expect(
    page.getByRole("heading", { name: /Unlock RealEstate AI Pro/i }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Finish your profile" }),
  ).toHaveCount(0);

  await grantTestAccess(page);

  await expect(
    page.getByText(/Command Center|Action Desk/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: /Set up profile \/ MLS/i }).first(),
  ).toBeVisible();

  const state = await readWorkspaceState(page);
  expect(state?.onboarded).toBe(false);
  expect(state?.access).toBe("trialing");
});
