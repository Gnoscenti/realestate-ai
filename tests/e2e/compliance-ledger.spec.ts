import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { grantTestAccess, resetApp } from "./helpers";

test.describe.configure({ retries: 0 });
test("fractionalization simulation persists, enforces eligibility, refunds and exports without claiming a chain transaction", async ({ page }, testInfo) => {
  await resetApp(page);
  await grantTestAccess(page);
  await page.goto("/marketing");
  const studio = page.getByLabel("Actual-photo image studio");
  await studio.getByLabel("Property title", { exact: true }).fill("Fictional fractionalization acceptance property");
  await studio.getByLabel("Property address", { exact: true }).fill("Synthetic test reference only");
  await studio.getByLabel(/I have permission to market/).check();
  await studio.getByRole("button", { name: "Save property for photos" }).click();
  await expect(studio.getByRole("status")).toContainText("Property saved");
  await page.goto("/transactions");
  await page.getByRole("tab", { name: "Fractionalization lab" }).click();
  const lab = page.getByTestId("compliance-sandbox");
  await expect(lab.getByText(/Simulation only. No identity verification/)).toBeVisible();
  await lab.getByLabel("Property reference", { exact: true }).selectOption({ label: "Fictional fractionalization acceptance property · unknown" });
  await lab.getByRole("button", { name: "Generate Fractional Compliance Engine" }).click();
  await expect(lab.getByRole("status")).toContainText("Simulation created");
  await expect(lab.getByRole("button", { name: "Simulate deposit" })).toBeDisabled();
  await lab.getByRole("button", { name: "Run mock identity check" }).click();
  await expect(lab.getByRole("status")).toContainText("Mock identity approved");
  await lab.getByLabel("Amount in test USDC").fill("250.000001");
  await lab.getByRole("button", { name: "Simulate deposit" }).click();
  await expect(lab.getByTestId("sandbox-balance")).toHaveText("250.000001");
  await lab.getByLabel("Amount in test USDC").fill("100");
  await lab.getByRole("button", { name: "Simulate allocation" }).click();
  await expect(lab.getByTestId("sandbox-balance")).toHaveText("150.000001");
  await expect(lab.getByTestId("sandbox-units")).toHaveText("100");
  await page.reload();
  await page.getByRole("tab", { name: "Fractionalization lab" }).click();
  await expect(lab.getByTestId("sandbox-units")).toHaveText("100");
  await lab.getByRole("button", { name: "Revoke mock claim" }).click();
  await expect(lab.getByRole("status")).toContainText("Mock identity revoked");
  await expect(lab.getByRole("button", { name: "Simulate allocation" })).toBeDisabled();
  await lab.getByLabel("Amount in test USDC").fill("150.000001");
  await lab.getByRole("button", { name: "Simulate refund" }).click();
  await expect(lab.getByTestId("sandbox-balance")).toHaveText("0");
  await expect(lab.getByText("Test funds refunded · 150.000001", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await lab.getByRole("button", { name: "Export simulation" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  const content = await readFile(path!, "utf8");
  expect(content).toContain("Simulation only");
  expect(content).toContain("no deployed contract");
  expect(content).toContain("Test funds refunded");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("fractionalization-mobile.png"), fullPage: true });
});


test("older simulations remain reachable for refunds and export after more than 100 properties", async ({ page }) => {
  // This exercises 101 real persisted cases, not an increased timeout on a retry.
  test.setTimeout(180_000);
  await resetApp(page);
  await grantTestAccess(page);
  const title = `Older sandbox regression ${Date.now()}`;
  // Use the same authenticated server functions as the UI for bulk setup in the
  // development test server; there is no fixture endpoint or mocked persistence.
  const listingId = await page.evaluate(async ({ title, listingModule, sandboxModule }) => {
    const { createManualSocialListing } = await import(listingModule);
    const { createMyComplianceSandbox, updateMyComplianceSandbox } = await import(sandboxModule);
    const old = await createManualSocialListing({ data: { title, address: "Synthetic test reference", rightsConfirmed: true } });
    let saved = await createMyComplianceSandbox({ data: { listingId: old.id } });
    const wallet = "0x1111111111111111111111111111111111111111";
    saved = await updateMyComplianceSandbox({ data: { kind: "verify_mock_identity", caseId: saved.id,
      expectedRevision: saved.revision, operationId: crypto.randomUUID(), wallet } });
    await updateMyComplianceSandbox({ data: { kind: "deposit", caseId: saved.id,
      expectedRevision: saved.revision, operationId: crypto.randomUUID(), wallet, amount: "1.5" } });
    for (let i = 0; i < 100; i++) {
      const newer = await createManualSocialListing({ data: { title: `Newer synthetic reference ${i}`, address: "Synthetic test reference", rightsConfirmed: true } });
      await createMyComplianceSandbox({ data: { listingId: newer.id } });
    }
    return old.id as string;
  }, { title, listingModule: "/src/lib/social-media/managed-api.ts", sandboxModule: "/src/lib/compliance-ledger/api.ts" });
  await page.goto("/transactions");
  await page.getByRole("tab", { name: "Fractionalization lab" }).click();
  const lab = page.getByTestId("compliance-sandbox");
  const selector = lab.getByLabel("Property reference", { exact: true });
  await expect(lab.getByRole("button", { name: "Load older properties" })).toBeEnabled();
  await expect(selector.locator(`option[value="${listingId}"]`)).toHaveCount(0);
  await lab.getByRole("button", { name: "Load older properties" }).click();
  await selector.selectOption(listingId);
  await expect(lab.getByTestId("sandbox-balance")).toHaveText("1.5");
  await lab.getByRole("button", { name: "Refresh saved sandbox" }).click();
  await expect(selector).toHaveValue(listingId);
  await expect(lab.getByTestId("sandbox-balance")).toHaveText("1.5");
  await lab.getByLabel("Amount in test USDC").fill("1.5");
  await lab.getByRole("button", { name: "Simulate refund" }).click();
  await expect(lab.getByTestId("sandbox-balance")).toHaveText("0");
  await page.reload();
  await page.getByRole("tab", { name: "Fractionalization lab" }).click();
  await lab.getByRole("button", { name: "Load older properties" }).click();
  await selector.selectOption(listingId);
  await expect(lab.getByTestId("sandbox-balance")).toHaveText("0");
  await expect(lab.getByText("Test funds refunded · 1.5", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await lab.getByRole("button", { name: "Export simulation" }).click();
  const path = await (await downloadPromise).path();
  expect(path).toBeTruthy();
  const ledger = await readFile(path!, "utf8");
  expect(ledger).toContain(title);
  expect(ledger).toContain("Test funds refunded");
  expect(ledger).toContain("Simulation only");
});
