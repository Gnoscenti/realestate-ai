import { expect, test, type Page } from "@playwright/test";
import { grantTestAccess, readWorkspaceState, resetApp } from "./helpers";

/**
 * Interface defects that were visible to every tester. Each test fails against
 * the behaviour it replaced.
 */

async function openWorkspace(page: Page) {
  await resetApp(page);
  await grantTestAccess(page);
}

test("the Command Center opens at the top of the page", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: /Here's your day/ })).toBeVisible();
  // The assistant used to scroll itself into view on mount, dragging the whole
  // page past its heading. Give any such scroll time to happen before checking.
  await page.waitForTimeout(1_200);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("heading", { level: 1, name: /Here's your day/ })).toBeInViewport();
});

test("pinch-zoom is not disabled", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("width=device-width");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(viewport).not.toMatch(/maximum-scale/i);
});

test("the sidebar groups destinations and keeps the current page's link in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openWorkspace(page);
  const sidebar = page.getByRole("complementary");
  for (const group of ["Win business", "Clients & deals", "Listings & market", "Account"]) {
    await expect(sidebar.getByRole("group", { name: group })).toBeVisible();
  }
  // Billing sits at the bottom of a list taller than the window.
  await page.goto("/billing", { waitUntil: "networkidle" });
  const current = sidebar.getByRole("link", { name: "Billing & Access", exact: true });
  await expect(current).toHaveAttribute("data-nav-active", "true");
  await expect(current).toBeInViewport({ ratio: 1 });
});

test("an empty rental portfolio shows no calculated nonsense or false status", async ({ page }) => {
  await openWorkspace(page);
  const state = await readWorkspaceState(page);
  await page.goto("/properties", { waitUntil: "networkidle" });
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "Property Management" })).toBeVisible();
  await expect(main).not.toContainText("NaN");
  await expect(main).not.toContainText("Portfolio live");
  await expect(main.getByText("No rental units yet")).toBeVisible();
  // Looking at the page must not create data.
  expect((await readWorkspaceState(page))?.leads).toBe(state?.leads);
});

test("an empty lead book says so, offers the next step, and invents no market statistic", async ({
  page,
}) => {
  await openWorkspace(page);
  expect((await readWorkspaceState(page))?.leads).toBe(0);
  await page.goto("/leads", { waitUntil: "networkidle" });
  const main = page.getByRole("main");
  await expect(main.getByText("No leads yet", { exact: true })).toBeVisible();
  await expect(main.getByText("No leads match your filters.")).toHaveCount(0);
  // No data source produced the old "ADU interest up ~40% this month" card.
  await expect(main).not.toContainText(/ADU interest/i);
  await expect(main).not.toContainText(/up ~?\d+%/i);
  // Actions that need a lead are not offered on an empty book.
  await expect(
    main.getByRole("button", { name: "Set follow-ups for tomorrow" }).first(),
  ).toBeDisabled();
  // The empty state leads straight into the form.
  await main.getByRole("button", { name: "Add your first lead" }).click();
  await expect(page.getByRole("dialog", { name: "Add lead" })).toBeVisible();
  await expect(page.getByLabel("Lowest budget ($)")).toBeVisible();
});

test("Transaction Hub opens on the tab that works", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/transactions", { waitUntil: "networkidle" });
  await expect(page.getByRole("tab", { name: "Milestones" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByText("No deals yet").first()).toBeVisible();
  // The unavailable upload is described, not offered as a control.
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByRole("button", { name: /upload/i })).toHaveCount(0);
  await expect(page.getByText("Not available yet.", { exact: false })).toBeVisible();
});

test("the Feedback Board says its notes stay on this device", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/feedback", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Feedback Board" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("saved on this device only");
  await expect(page.getByRole("button", { name: "Save note" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Submit feedback/i })).toHaveCount(0);
});

test("the billing page shows a customer their access, not internal code lists", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/billing", { waitUntil: "networkidle" });
  const main = page.getByRole("main");
  await expect(main.getByText("Access active")).toBeVisible();
  // Access restored from the server after browser storage was cleared: the
  // browser no longer knows which code, and must still not call it a purchase.
  await expect(main.getByText(/Unlocked with (a )?beta code/)).toBeVisible();
  await expect(main).not.toContainText("Paid access");
  await expect(main).not.toContainText("Pilot codes");
  await expect(main).not.toContainText("src/lib");
  // The workspace price never renews, but the phone add-on does.
  await expect(main.getByText(/billed separately each month/)).toBeVisible();
});

test("theme colour names used by components all resolve to a colour", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/marketing", { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Open beta feedback drawer", exact: true });
  await expect(trigger).toBeVisible();
  // text-primary-foreground on bg-primary: without the token the label inherited
  // the light body colour and fell below AA contrast on the blue button.
  const colors = await trigger.evaluate((element) => {
    const style = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    return {
      text: style.color,
      background: style.backgroundColor,
      body: getComputedStyle(document.body).color,
      token: root.getPropertyValue("--color-primary-foreground").trim(),
    };
  });
  expect(colors.token).not.toBe("");
  expect(colors.text).not.toBe(colors.body);
  expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");

  await page.getByRole("button", { name: "Position feedback button" }).click();
  const menu = page.getByRole("dialog", { name: "Position feedback button" });
  await expect(menu).toBeVisible();
  // bg-popover: the menu was see-through over page content.
  expect(await menu.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("on a phone the feedback button rests in the bottom corner, above the tab bar", async ({
  page,
}) => {
  const height = 844;
  await page.setViewportSize({ width: 390, height });
  // resetApp clears any position a previous test saved, so this is the default.
  await openWorkspace(page);
  await page.goto("/", { waitUntil: "networkidle" });
  const trigger = page.getByTestId("beta-feedback-trigger");
  await expect(trigger).toBeVisible();
  const triggerBox = await trigger.boundingBox();
  const tabBar = await page.getByRole("navigation", { name: "Main sections" }).boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(tabBar).not.toBeNull();
  // Halfway up the edge it covered page controls at first paint, including
  // "Skip for now" on a new workspace. It belongs in the lower third...
  expect(triggerBox!.y).toBeGreaterThan(height * (2 / 3));
  // ...and never on top of the tab bar.
  expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(tabBar!.y);
});

test("the phone menu keeps Sign out and profile on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Workspace menu" });
  await expect(menu).toBeVisible();
  const profile = menu.getByRole("button", { name: /^(Edit|Set up) profile$/ });
  await expect(profile).toBeInViewport({ ratio: 1 });
  // The last destination is reachable by scrolling the list, not cut off.
  const last = menu.getByRole("link", { name: "Edge Playbook", exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 1 });
});
