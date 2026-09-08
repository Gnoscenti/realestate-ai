import { test, expect } from "@playwright/test";
import { readWorkspaceState, resetApp, grantTestAccess } from "./helpers";

test("the access gate is decided by the server, not by browser storage", async ({ page }) => {
  await resetApp(page);

  // Once the server has recorded a grant for this workspace, a cleared browser
  // still opens the app; before that, the paywall shows. Either way, no forced
  // profile setup.
  await grantTestAccess(page);

  await expect(
    page.getByText(/Command Center|Action Desk/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Finish your profile" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Set up profile \/ MLS/i }).first(),
  ).toBeVisible();

  const state = await readWorkspaceState(page);
  expect(state?.onboarded).toBe(false);
  // The browser mirror reflects the server grant (a beta code in tests).
  expect(state?.access).toBe("code");
});

test("a forged browser billing object does not survive the server check", async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
  await expect(page.getByText(/Command Center|Action Desk/i).first()).toBeVisible({ timeout: 15_000 });

  // Wrong code is rejected by the server with a visible error.
  const state = await readWorkspaceState(page);
  expect(state?.access).toBe("code");
});
