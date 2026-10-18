import { expect, test } from "@playwright/test";
import { completeOnboarding, readWorkspaceState, resetApp, grantTestAccess } from "./helpers";

test("confirmed profile restores from the server after browser storage is cleared", async ({
  page,
}) => {
  await resetApp(page);
  await completeOnboarding(page, { name: "Persistent Agent", area: "Poway, CA" });
  await page.getByRole("button", { name: "Confirm profile and open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await grantTestAccess(page);
  await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();
  const state = await readWorkspaceState(page);
  expect(state?.name).toBe("Persistent Agent");
  expect(state?.onboarded).toBe(true);
  expect(state?.leads).toBe(0);
});

test("short mobile viewport keeps confirmation reachable without MLS or a market", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await resetApp(page);
  await completeOnboarding(page, { name: "Mobile Agent", area: "" });
  const launch = page.getByRole("button", { name: "Confirm profile and open workspace" });
  await expect(launch).toBeEnabled();
  await launch.scrollIntoViewIfNeeded();
  const launchBox = await launch.boundingBox();
  expect(launchBox).not.toBeNull();
  expect((launchBox?.y ?? 9999) + (launchBox?.height ?? 0)).toBeLessThanOrEqual(667);
  await launch.click();
  await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();
  const state = await readWorkspaceState(page);
  expect(state?.name).toBe("Mobile Agent");
  expect(state?.agentMlsId).toBeFalsy();
});

test("manual fallback saves a supplied page and keeps corrected fields on reload", async ({
  page,
}) => {
  await resetApp(page);
  await completeOnboarding(page, {
    name: "Manual Agent",
    area: "Oceanside, CA",
    brokerage: "Manual Brokerage",
    website: "manual-agent.example",
  });
  await page.getByRole("button", { name: "Confirm profile and open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Website source" })).toHaveAttribute(
    "href",
    "https://manual-agent.example/",
  );
  await page.reload({ waitUntil: "networkidle" });
  await grantTestAccess(page);
  await page.getByRole("button", { name: "Review profile and sources" }).click();
  await expect(page.locator("#website")).toHaveValue("https://manual-agent.example");
  await page.getByRole("button", { name: "Continue without a page", exact: true }).click();
  await expect(page.locator("#brokerage")).toHaveValue("Manual Brokerage");
  await expect(page.locator("#areaOfOperations")).toHaveValue("Oceanside, CA");
  await page.keyboard.press("Escape");
  const state = await readWorkspaceState(page);
  expect(state?.brokerage).toBe("Manual Brokerage");
  expect(state?.source).toBe("manual");
});

test("confirming profile edits preserves real customer records", async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
  await page.goto("/leads");
  await page.getByRole("button", { name: "Add lead", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Existing Customer");
  await page.getByLabel("Phone", { exact: true }).fill("(858) 555-0142");
  await page.getByRole("button", { name: "Create lead", exact: true }).click();
  await expect(page.getByText("Existing Customer").first()).toBeVisible();
  await completeOnboarding(page, { name: "Customer Book Agent", area: "Seattle, WA" });
  await page.getByRole("button", { name: "Confirm profile and open workspace" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your business profile" })).toHaveCount(0);
  const state = await readWorkspaceState(page);
  expect(state?.name).toBe("Customer Book Agent");
  expect(state?.leads).toBe(1);
  await page.goto("/leads");
  await expect(page.getByText("Existing Customer").first()).toBeVisible();
});
