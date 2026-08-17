import { expect, test } from "@playwright/test";
import {
  completeOnboarding,
  readWorkspaceState,
  resetApp,
  grantTestAccess,
} from "./helpers";

test("onboarding profile survives a hard reload", async ({ page }) => {
  await resetApp(page);
  await completeOnboarding(page, {
    name: "Persistent Agent",
    area: "Poway, CA",
  });
  await page.getByRole("button", { name: /Launch workspace/i }).click();
  await grantTestAccess(page);

  await page.reload({ waitUntil: "networkidle" });

  await expect(
    page.getByRole("heading", { name: "Finish your profile" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Command Center|Action Desk/i).first(),
  ).toBeVisible({ timeout: 20_000 });
  const state = await readWorkspaceState(page);
  expect(state?.name).toBe("Persistent Agent");
  expect(state?.onboarded).toBe(true);
});

test("short mobile viewport keeps required fields and launch reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await resetApp(page);

  const name = page.locator("#agent-name");
  await expect(name).toBeVisible();
  const nameBox = await name.boundingBox();
  expect(nameBox?.y ?? -1).toBeGreaterThanOrEqual(0);

  await completeOnboarding(page, {
    name: "Mobile Agent",
    area: "San Diego, CA",
  });
  const launch = page.getByRole("button", { name: /Launch workspace/i });
  await launch.scrollIntoViewIfNeeded();
  await expect(launch).toBeVisible();
  const launchBox = await launch.boundingBox();
  expect(launchBox).not.toBeNull();
  expect((launchBox?.y ?? 9999) + (launchBox?.height ?? 0)).toBeLessThanOrEqual(
    667,
  );
});

test("failed website scan preserves manual fields and can be skipped", async ({
  page,
}) => {
  await resetApp(page);
  await completeOnboarding(page, {
    name: "Manual Agent",
    area: "Oceanside, CA",
    brokerage: "Manual Brokerage",
    website: "http://127.0.0.1:9",
  });

  await page.getByRole("button", { name: /Scan website/i }).click();
  const continueButton = page.getByRole("button", {
    name: /Continue without website scan/i,
  });
  await expect(continueButton).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#brokerage")).toHaveValue("Manual Brokerage");

  await continueButton.click();
  await page.getByRole("button", { name: /Launch workspace/i }).click();

  const state = await readWorkspaceState(page);
  expect(state?.brokerage).toBe("Manual Brokerage");
  expect(state?.source).toBe("manual");
});
