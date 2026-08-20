import { test, expect } from "@playwright/test";
import { startMockRealtorSite } from "../fixtures/mock-realtor-site.mjs";
import {
  completeOnboarding,
  readWorkspaceState,
  resetApp,
  unlockWithBetaCode,
} from "./helpers";

test.describe("onboarding website scrape", () => {
  let site: Awaited<ReturnType<typeof startMockRealtorSite>>;

  test.beforeAll(async () => {
    site = await startMockRealtorSite(0);
  });

  test.afterAll(async () => {
    await site.close();
  });

  test("loads listings without binding organization contacts to the person", async ({
    page,
  }) => {
    await resetApp(page);

    await completeOnboarding(page, {
      name: "Morgan Hale",
      area: "Rancho Santa Fe, CA",
      website: site.url,
      brokerage: "Compass",
    });

    // The fixture intentionally exposes an organization-typed RealEstateAgent.
    // Listings remain usable, but its contact fields are not Person evidence.
    await page.getByRole("button", { name: /Scan website/i }).click();
    await expect(page.getByText(/listing\(s\)/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(/\(858\) 555-0142|8585550142/),
    ).toHaveCount(0);

    await page.getByRole("button", { name: /Launch workspace/i }).click();
    await unlockWithBetaCode(page);

    await expect(
      page.getByText(/Command Center|Action Desk/i).first(),
    ).toBeVisible({ timeout: 20_000 });

    const state = await readWorkspaceState(page);
    expect(state).toBeTruthy();
    expect(state!.name).toBe("Morgan Hale");
    expect(state!.seedLeads).toBe(false);
    expect(state!.props).toBeGreaterThanOrEqual(2);
    expect(state!.leads).toBe(0);
    expect(state!.phone).toBeFalsy();
    expect(state!.photo).toBeFalsy();
    expect(state!.source).toBe("website");
  });
});
