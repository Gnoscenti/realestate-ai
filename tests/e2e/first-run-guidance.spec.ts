import { expect, test } from "@playwright/test";
import {
  readWorkspaceState,
  resetApp,
  grantTestAccess,
} from "./helpers";

test("fresh mobile workspace gives direct tasks without a setup wall", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await resetApp(page);
  await grantTestAccess(page);

  await expect(
    page.getByTestId("fresh-workspace-guide"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Choose one real task" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Add a lead/i })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Connect listings/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Add appointment/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Finish your profile" }),
  ).toHaveCount(0);

  const width = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  const clientWidth = await page.evaluate(
    () => document.documentElement.clientWidth,
  );
  expect(width).toBeLessThanOrEqual(clientWidth + 8);
});

test("optional profile setup can be dismissed without changing workspace", async ({
  page,
}) => {
  await resetApp(page);
  await grantTestAccess(page);

  await page
    .getByRole("button", { name: /Add profile \(optional\)|Set up profile/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Finish your profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();

  await expect(
    page.getByRole("heading", { name: "Choose one real task" }),
  ).toBeVisible();
  const state = await readWorkspaceState(page);
  expect(state?.onboarded).toBe(false);
});

test("new field user can add a phone-only lead and get a next action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await resetApp(page);
  await grantTestAccess(page);

  await page.getByRole("link", { name: /Add a lead/i }).click();
  await page.getByRole("button", { name: "Add lead" }).click();
  await page.getByLabel("Name").fill("Field Test Lead");
  await page.getByLabel("Phone").fill("(858) 555-0142");
  await page.getByRole("button", { name: "Create lead" }).click();

  await expect(page.getByText("Field Test Lead").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Field Test Lead").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Action pack", { exact: true })).toBeVisible();
});
