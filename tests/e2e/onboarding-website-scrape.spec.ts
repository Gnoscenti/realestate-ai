import { test, expect, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { startOnboardingPages } from "../fixtures/onboarding-pages.mjs";
import { grantTestAccess, readWorkspaceState, resetApp } from "./helpers";

async function openSetup(page: Page) {
  await resetApp(page);
  await grantTestAccess(page);
  if (!(await page.locator("#website").isVisible())) {
    await page.evaluate(() => window.dispatchEvent(new Event("realestate-ai:open-profile-setup")));
  }
  await expect(page.locator("#website")).toBeEnabled();
}

test.describe("website and brokerage onboarding", () => {
  let site: Awaited<ReturnType<typeof startOnboardingPages>>;
  let personName: string;
  test.beforeEach(async () => {
    // Auth-disabled tests share a durable dev workspace. A new, valid Person
    // name on every attempt prevents old saved fields from masking extraction.
    const suffix = randomBytes(8)
      .toString("hex")
      .replace(/\d/g, (digit) => String.fromCharCode(103 + Number(digit)));
    personName = `Avery Test${suffix}`;
    site = await startOnboardingPages({ name: personName });
  });
  test.afterEach(async () => {
    await site.close();
  });

  test("two explicit pages produce a confirmed personalized workspace without a lead", async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: 390, height: 667 });
    await openSetup(page);
    await page.locator("#website").fill(`${site.url}/website`);
    await page.locator("#brokerage-bio").fill(`${site.url}/bio`);
    await page.getByRole("button", { name: "Build my workspace", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`This is me.*${personName}`) }).click();
    await expect(page.locator("#agent-name")).toHaveValue(personName);
    await expect(page.locator("#phone")).toHaveValue("5035550123");
    await expect(page.locator("#areaOfOperations")).toHaveValue("Portland, OR");
    await expect(page.getByText("Some details differ across sources")).toBeVisible();
    await expect(page.locator("#agentMlsId")).toHaveValue("AO12345");
    await expect(page.locator("#license")).toHaveValue("");
    await page.getByRole("button", { name: "Use 5035550456", exact: true }).click();
    await page.getByRole("button", { name: "Confirm profile and open workspace" }).click();
    await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();
    expect((await readWorkspaceState(page))?.leads).toBe(0);
    expect((await readWorkspaceState(page))?.props).toBe(0);
    await page.getByRole("button", { name: "Prepare marketing", exact: true }).click();
    await expect(page.getByRole("region", { name: "Marketing starter" })).toContainText(personName);
    await expect(page.getByRole("region", { name: "Marketing starter" })).toContainText(
      "Example Coast Realty",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );

    // A new context has no browser profile: server hydration restores it.
    const second = await browser.newContext();
    const restored = await second.newPage();
    await restored.goto("/");
    await grantTestAccess(restored);
    await expect(restored.getByRole("heading", { name: "Your business overview" })).toBeVisible();
    const state = await readWorkspaceState(restored);
    expect(state?.name).toBe(personName);
    expect(state?.phone).toBe("5035550456");
    expect(state?.agentMlsId).toBe("AO12345");
    await second.close();
  });

  test("a wrong-person biography cannot overwrite a corrected contact on rescan", async ({
    page,
  }) => {
    // Establish this test's own source-derived identity and deliberate edit.
    await openSetup(page);
    await page.locator("#website").fill(`${site.url}/website`);
    await page.locator("#brokerage-bio").fill("");
    await page.getByRole("button", { name: "Build my workspace", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`This is me.*${personName}`) }).click();
    await expect(page.locator("#phone")).toHaveValue("5035550123");
    await page.locator("#phone").fill("5035550777");
    await page.getByRole("button", { name: "Confirm profile and open workspace" }).click();
    await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();

    await openSetup(page);
    await page.locator("#website").fill(`${site.url}/website`);
    await page.locator("#brokerage-bio").fill(`${site.url}/wrong`);
    await page.getByRole("button", { name: "Build my workspace", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`This is me.*${personName}`) }).click();
    await expect(
      page.getByText("No matching person on this page. Its profile details will not be used."),
    ).toBeVisible();
    await expect(page.locator("#phone")).toHaveValue("5035550777");
    await expect(page.locator("#email")).not.toHaveValue("blair@onboarding.test");
    await page.getByRole("button", { name: "Confirm profile and open workspace" }).click();
    await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();
    expect((await readWorkspaceState(page))?.phone).toBe("5035550777");
  });

  test("one blocked page leaves usable biography results", async ({ page }) => {
    await openSetup(page);
    await page.locator("#website").fill(`${site.url}/blocked`);
    await page.locator("#brokerage-bio").fill(`${site.url}/bio`);
    await page.getByRole("button", { name: "Build my workspace", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`This is me.*${personName}`) }).click();
    await expect(page.getByText(/HTTP 403/)).toBeVisible();
    await expect(page.locator("#phone")).toHaveValue("5035550456");
    await expect(page.locator("#areaOfOperations")).toHaveValue("Portland, OR");
    await page.getByRole("button", { name: "Confirm profile and open workspace" }).click();
    await expect(page.getByRole("heading", { name: "Your business overview" })).toBeVisible();
    await page.getByRole("link", { name: "Try a sample inquiry", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Try a sample inquiry|Scan sample inbox again/ }),
    ).toBeVisible();
    await expect(page.getByText("Synthetic leads and appointments only.", { exact: false })).toBeVisible();
  });

  test("editing the URL while a source is pending discards the late result", async ({ page }) => {
    await openSetup(page);
    await page.locator("#website").fill(`${site.url}/slow`);
    await page.locator("#brokerage-bio").fill("");
    await page.getByRole("button", { name: "Build my workspace", exact: true }).click();
    await expect(page.getByText("Reading website…", { exact: true })).toBeVisible();
    await page.locator("#website").fill(`${site.url}/website`);
    await page.waitForTimeout(1500);
    await expect(page.getByRole("button", { name: /This is me.*Late Response/ })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Build my workspace", exact: true }),
    ).toBeEnabled();
  });
});
