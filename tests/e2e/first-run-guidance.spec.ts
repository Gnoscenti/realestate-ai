import { expect, test, type Page } from "@playwright/test";
import { readWorkspaceState, resetApp, grantTestAccess } from "./helpers";

async function showOutcomes(page: Page) {
  const skip = page.getByRole("button", { name: "Skip for now", exact: true });
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByRole("link", { name: "Try a sample inquiry", exact: true })).toBeVisible();
}

test("mobile source setup offers two pages and an optional exit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await resetApp(page);
  await grantTestAccess(page);
  const before = await readWorkspaceState(page);
  // Later tests can restore a server-owned profile even after browser data is reset.
  if (!(await page.getByLabel("Your real-estate website", { exact: true }).isVisible())) {
    await page.getByRole("button", { name: "Review profile and sources" }).click();
  }
  await expect(page.getByLabel("Your real-estate website", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Your brokerage biography page", { exact: true })).toBeVisible();
  await expect(
    page.getByText("One page is enough to start. You can add the other later."),
  ).toBeVisible();
  await expect(page.locator("#agent-name")).toHaveCount(0);
  const build = page.getByRole("button", { name: "Build my workspace", exact: true });
  await build.scrollIntoViewIfNeeded();
  const buttonBox = await build.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect((buttonBox?.y ?? 9999) + (buttonBox?.height ?? 0)).toBeLessThanOrEqual(667);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Your real-estate website", { exact: true })).toHaveCount(0);
  const after = await readWorkspaceState(page);
  expect(after?.name).toBe(before?.name);
  expect(after?.leads).toBe(before?.leads);
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 8);
});

test("first outcomes and keyboard coach do not require a lead", async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
  await showOutcomes(page);
  const guide = page.getByTestId("fresh-workspace-guide");
  await expect(guide.getByRole("button", { name: "Prepare marketing" })).toBeVisible();
  await expect(guide.getByRole("link", { name: "Inspect visibility" })).toHaveAttribute(
    "href",
    "/aieo",
  );
  await expect(guide.getByRole("link", { name: "Try a sample inquiry" })).toHaveAttribute(
    "href",
    "/outreach",
  );
  await expect(guide.getByRole("link", { name: /Add a lead/i })).toHaveCount(0);
  const restart = page.getByRole("button", { name: "Restart workspace tip" });
  await restart.click();
  const coach = page.getByLabel("Workspace coach", { exact: true });
  await expect(coach).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(coach).toHaveCount(0);
  await expect(restart).toBeFocused();
  await restart.click();
  await expect(coach).toBeVisible();
  expect((await readWorkspaceState(page))?.leads).toBe(0);
});

test("sample inquiry is useful without creating real leads", async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
  await showOutcomes(page);
  await page.getByRole("link", { name: "Try a sample inquiry", exact: true }).click();
  await expect(page).toHaveURL(/\/outreach\/?$/);
  await expect(
    page.getByText("Synthetic leads and appointments only.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Try a sample inquiry|Scan sample inbox again/ }),
  ).toBeVisible();
  expect((await readWorkspaceState(page))?.leads).toBe(0);
});
