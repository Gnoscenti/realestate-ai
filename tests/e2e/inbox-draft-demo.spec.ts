import { expect, test, type Page } from "@playwright/test";
import { WORKSPACE_STORAGE_BASE_KEY } from "../../src/lib/auth/workspace-storage-keys";
import { grantTestAccess, readWorkspaceState, resetApp } from "./helpers";

// These cases share the documented dev-user backend and must not race resets.
test.describe.configure({ mode: "serial" });

async function openEmptyLeadBook(page: Page) {
  await resetApp(page);
  await grantTestAccess(page);
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    saved.state = { ...saved.state, leads: [] };
    localStorage.setItem(key, JSON.stringify(saved));
  }, `${WORKSPACE_STORAGE_BASE_KEY}:dev-user`);
  await page.goto("/outreach");
  const panel = page.getByTestId("inbox-draft-demo");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Loading your saved demo…")).toHaveCount(0);
  const fresh = panel.getByRole("button", { name: "Start a fresh sample" });
  if (await fresh.count()) {
    await fresh.click();
  }
  await panel.getByRole("button", { name: "Try a sample inquiry" }).click();
  await expect(panel.getByTestId("inbox-demo-draft")).toHaveCount(1);
  return panel;
}

test("empty lead book can identify, deduplicate, edit, and approve an inquiry without sending", async ({ page }) => {
  const panel = await openEmptyLeadBook(page);
  await expect(page.getByText("Your lead book is empty.", { exact: false })).toBeVisible();
  await expect(panel).toContainText("Synthetic leads and appointments only");
  await expect(panel.getByTestId("inbox-demo-summary")).toContainText("1 new, 1 duplicate delivery skipped, 1 non-inquiry ignored");
  await expect(panel.getByTestId("inbox-demo-recipient")).toHaveText("jordan@buyer.test");
  await expect(panel.getByTestId("inbox-demo-slot")).toHaveCount(2);
  await expect(panel.getByLabel("Response draft")).toHaveValue(/Jordan/);
  await expect(panel.getByLabel("Response draft")).toHaveValue(/123 Example Lane/);
  await panel.getByText("View sample inquiry sources", { exact: true }).click();
  await expect(panel).toContainText("Vendor proposal · Not a customer inquiry; no response prepared.");
  await expect(panel).toContainText("notifications@portal.test");

  await panel.getByRole("button", { name: "Scan sample inbox again" }).click();
  await expect(panel.getByTestId("inbox-demo-draft")).toHaveCount(1);
  await expect(panel.getByTestId("inbox-demo-summary")).toContainText("0 new, 2 duplicate deliveries skipped");

  const approve = panel.getByRole("button", { name: "Approve demo draft", exact: true });
  const review = panel.getByRole("checkbox", { name: /I reviewed the recipient/ });
  await expect(approve).toBeDisabled();
  await review.check();
  await expect(approve).toBeEnabled();
  const editedBody = `${await panel.getByLabel("Response draft").inputValue()}\n\nI look forward to helping you explore the home.`;
  await panel.getByLabel("Response draft").fill(editedBody);
  await expect(approve).toBeDisabled();
  await expect(review).not.toBeChecked();
  await expect(review).toBeDisabled();
  await panel.getByRole("button", { name: "Save draft changes" }).click();
  await expect(panel).toContainText("Saved revision 2");
  await expect(approve).toBeDisabled();
  await expect(review).not.toBeChecked();
  await review.check();
  await approve.click();
  await expect(panel.getByText("Approved demo draft — nothing sent", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: /^(send|copy|book)\b/i })).toHaveCount(0);
  await expect(panel.locator('a[href^="mailto:"], a[href^="tel:"]')).toHaveCount(0);

  await page.reload();
  await expect(panel.getByText("Approved demo draft — nothing sent", { exact: true })).toBeVisible();
  await expect(panel.getByLabel("Response draft")).toHaveValue(editedBody);
  // An approved saved revision cannot approve a later edit implicitly.
  await panel.getByLabel("Email subject").fill("Updated sample response");
  await expect(panel.getByText("Approved demo draft — nothing sent", { exact: true })).toHaveCount(0);
  await expect(approve).toBeDisabled();
  await panel.getByRole("button", { name: "Save draft changes" }).click();
  await expect(panel).toContainText("Saved revision 3");
  await expect(approve).toBeDisabled();
  expect((await readWorkspaceState(page))?.leads).toBe(0);
});

test("a stale reviewer must reload and review the latest saved revision", async ({ page, context }) => {
  const panel = await openEmptyLeadBook(page);
  const secondPage = await context.newPage();
  try {
    await secondPage.goto("/outreach");
    const secondPanel = secondPage.getByTestId("inbox-draft-demo");
    await expect(secondPanel).toContainText("Saved revision 1");
    await secondPanel.getByRole("checkbox", { name: /I reviewed the recipient/ }).check();
    await panel.getByLabel("Email subject").fill("The first reviewer saved a new subject");
    await panel.getByRole("button", { name: "Save draft changes" }).click();
    await expect(panel).toContainText("Saved revision 2");
    await secondPanel.getByRole("button", { name: "Approve demo draft", exact: true }).click();
    await expect(secondPanel.getByRole("alert")).toBeVisible();
    await expect(secondPanel.getByText("Approved demo draft — nothing sent", { exact: true })).toHaveCount(0);
    await secondPanel.getByRole("button", { name: "Reload saved demo" }).click();
    await expect(secondPanel).toContainText("Saved revision 2");
    await expect(secondPanel.getByLabel("Email subject")).toHaveValue("The first reviewer saved a new subject");
    await expect(secondPanel.getByRole("checkbox", { name: /I reviewed the recipient/ })).not.toBeChecked();
    await expect(secondPanel.getByRole("button", { name: "Approve demo draft", exact: true })).toBeDisabled();
  } finally {
    await secondPage.close();
  }
});
