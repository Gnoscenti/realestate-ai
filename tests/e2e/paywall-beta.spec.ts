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
    page.getByRole("button", { name: /Set up profile/i }).first(),
  ).toBeVisible();

  const state = await readWorkspaceState(page);
  expect(state?.onboarded).toBe(false);
  // The browser mirror reflects the server grant (a beta code in tests).
  expect(state?.access).toBe("code");
});

test("the server grant restores the browser mirror after local billing tampering", async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
  const initial=await readWorkspaceState(page);
  expect(initial?.access).toBe("code");
  await page.evaluate(key=>{
    const stored=JSON.parse(localStorage.getItem(key) || "{}");
    stored.state.billing={status:"inactive",plan:null};
    localStorage.setItem(key,JSON.stringify(stored));
  },initial!.key);
  await page.reload({waitUntil:"networkidle"});
  await grantTestAccess(page);
  expect((await readWorkspaceState(page))?.access).toBe("code");
});
