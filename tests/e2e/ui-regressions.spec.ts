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

test("the assistant panel follows each reply without moving the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  // Instant scrolling, so the position can be asserted without waiting on an animation.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkspace(page);
  await page.goto("/", { waitUntil: "networkidle" });

  const log = page.getByRole("log");
  const ask = page.getByLabel("Ask the AI assistant");
  await ask.scrollIntoViewIfNeeded();
  /** Pixels of conversation hidden below the panel's visible area. */
  const hiddenBelow = () =>
    log.evaluate((element) => {
      const viewport = element.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
      if (!viewport) throw new Error("chat viewport not found");
      return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    });

  for (let turn = 1; turn <= 3; turn += 1) {
    await ask.fill(`Question ${turn}: what should I do first today?`);
    const pageScrollBefore = await page.evaluate(() => window.scrollY);
    await page.getByRole("button", { name: "Send question" }).click();
    // Every reply carries its own rating buttons; the welcome message has none.
    await expect(log.getByRole("button", { name: "Helpful", exact: true })).toHaveCount(turn, {
      timeout: 30_000,
    });
    await expect(log.getByText("Checking your workspace…")).toHaveCount(0);
    // The reply replaces the shorter "thinking" bubble in the same render. The
    // panel has to follow it; the page must stay where the agent was typing.
    await expect.poll(hiddenBelow).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
  }
  // The conversation really did outgrow the panel, so "at the bottom" was earned.
  const outgrewPanel = () =>
    log.evaluate((element) => {
      const viewport = element.closest<HTMLElement>("[data-radix-scroll-area-viewport]");
      return viewport ? viewport.scrollHeight > viewport.clientHeight : false;
    });
  expect(await outgrewPanel()).toBe(true);

  // Leaving and coming back remounts the panel with the conversation already
  // there. It opens on the latest reply, and the page itself opens at the top.
  const tabs = page.getByRole("navigation", { name: "Main sections" });
  await tabs.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search/);
  await tabs.getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(log.getByRole("button", { name: "Helpful", exact: true })).toHaveCount(3);
  expect(await outgrewPanel()).toBe(true);
  await expect.poll(hiddenBelow).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("pinch-zoom is not disabled", async ({ page }) => {
  await page.goto("/");
  const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
  expect(viewport).toContain("width=device-width");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
  expect(viewport).not.toMatch(/maximum-scale/i);
});

test("form fields are 16px on a phone, so focusing one does not zoom the page", async ({ page }) => {
  // iOS zooms in, and stays zoomed, when a focused field's text is under 16px.
  // With pinch-zoom allowed, nothing else prevents that.
  const fields = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>("input, textarea, select")]
        .filter((element) => element.getClientRects().length > 0)
        .filter(
          (element) =>
            !["checkbox", "radio", "file", "hidden", "range", "color"].includes(element.type),
        )
        .map((element) => ({
          field:
            element.id ||
            element.getAttribute("aria-label") ||
            element.getAttribute("placeholder") ||
            element.tagName.toLowerCase(),
          size: Number.parseFloat(getComputedStyle(element).fontSize),
        })),
    );

  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);
  const pages: Array<{ path: string; atLeast: number; open?: () => Promise<void> }> = [
    { path: "/", atLeast: 2 },
    {
      path: "/leads",
      atLeast: 8,
      open: async () => {
        await page.getByRole("button", { name: "Add lead", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Add lead" })).toBeVisible();
      },
    },
    { path: "/feedback", atLeast: 3 },
    { path: "/aieo", atLeast: 4 },
    {
      path: "/transactions",
      atLeast: 5,
      open: async () => {
        await page.getByRole("main").getByRole("button", { name: "Add deal", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Add deal" })).toBeVisible();
      },
    },
    {
      path: "/properties",
      atLeast: 7,
      open: async () => {
        await page.getByRole("main").getByRole("button", { name: "Add unit", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Add rental unit" })).toBeVisible();
      },
    },
    { path: "/alerts", atLeast: 1 },
  ];
  for (const target of pages) {
    await page.goto(target.path, { waitUntil: "networkidle" });
    await target.open?.();
    const found = await fields();
    // Guard against passing because nothing was on screen to measure.
    expect(found.length, `fields found on ${target.path}`).toBeGreaterThanOrEqual(target.atLeast);
    expect(
      found.filter((entry) => entry.size < 16),
      `fields under 16px on ${target.path}`,
    ).toEqual([]);
  }

  // The denser desktop size is unchanged.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "networkidle" });
  const assistant = (await fields()).find((entry) => entry.field === "Ask the AI assistant");
  expect(assistant?.size).toBe(14);
});

test("sidebar hints can be seen, and name the page when the sidebar is collapsed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openWorkspace(page);
  const sidebar = page.getByRole("complementary");
  const hint = page.getByTestId("hover-hint");

  await sidebar.getByRole("link", { name: "Social Desk", exact: true }).hover();
  await expect(hint).toContainText("Draft posts from facts");
  // Fully on screen: inside the sidebar's scrolling list it was clipped to nothing.
  await expect(hint).toBeInViewport({ ratio: 1 });

  await page.mouse.move(700, 400);
  await expect(hint).toHaveCount(0);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  // Collapsed, the icon is the only thing shown, so the hint is the page's name.
  await sidebar.getByRole("link", { name: "Social Desk", exact: true }).hover();
  await expect(hint).toContainText("Social Desk");
  await expect(hint).toBeInViewport({ ratio: 1 });
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

test("a lead that was only just added is not described as contacted", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/leads", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add your first lead" }).click();
  const dialog = page.getByRole("dialog", { name: "Add lead" });
  await dialog.getByLabel("Name", { exact: true }).fill("Never Contacted");
  await dialog.getByLabel("Phone", { exact: true }).fill("(858) 555-0101");
  await dialog.getByRole("button", { name: "Add lead", exact: true }).click();
  const main = page.getByRole("main");
  await expect(main.getByText("Never Contacted").first()).toBeVisible();
  // "Last contact" starts when a lead is added. Nobody has contacted this one,
  // and the Command Center lists it as waiting for a first reply.
  await expect(main).not.toContainText(/has been contacted/i);
  await expect(main).not.toContainText(/Nothing needs attention/i);
  await expect(main.getByText(/No overdue follow-ups/)).toBeVisible();
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

for (const viewport of [
  { name: "portrait", width: 390, height: 844 },
  // A phone on its side: short enough that a fixed share of the height lands
  // on the tab bar unless the button is held above it.
  { name: "landscape", width: 667, height: 375 },
]) {
  test(`on a ${viewport.name} phone the feedback button rests in the bottom corner, above the tab bar`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    // resetApp clears any position a previous test saved, so this is the default.
    await openWorkspace(page);
    await page.goto("/", { waitUntil: "networkidle" });
    const trigger = page.getByTestId("beta-feedback-trigger");
    await expect(trigger).toBeVisible();
    const tabBar = page.getByRole("navigation", { name: "Main sections" });
    await expect(tabBar).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    const tabBarBox = await tabBar.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(tabBarBox).not.toBeNull();
    // Halfway up the edge it covered page controls at first paint, including
    // "Skip for now" on a new workspace. It belongs in the lower third...
    expect(triggerBox!.y).toBeGreaterThan(viewport.height * (2 / 3));
    // ...and never on top of the tab bar.
    expect(triggerBox!.y + triggerBox!.height).toBeLessThanOrEqual(tabBarBox!.y);
  });
}

test("when the saved profile cannot be loaded, the retry button is reachable on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page);

  // Fail only the saved-profile request. In development a server function's
  // URL ends in base64url JSON that names the function.
  const isProfileRequest = (url: string) => {
    const id = new URL(url).pathname.split("/").pop() ?? "";
    try {
      return Buffer.from(id, "base64url").toString("utf8").includes("getOnboardingProfile");
    } catch {
      return false;
    }
  };
  let failProfile = true;
  await page.route("**/_serverFn/**", (route) =>
    failProfile && isProfileRequest(route.request().url()) ? route.abort("failed") : route.continue(),
  );
  await page.reload({ waitUntil: "networkidle" });

  const notice = page.getByTestId("profile-sync-notice");
  await expect(notice).toContainText("We couldn't load your saved profile");
  const retry = notice.getByRole("button", { name: "Try again" });
  const trigger = page.getByTestId("beta-feedback-trigger");
  await expect(trigger).toBeVisible();
  const retryBox = await retry.boundingBox();
  const triggerBox = await trigger.boundingBox();
  expect(retryBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  // The notice used to float in the bottom corner, under the feedback button.
  const apart =
    retryBox!.x + retryBox!.width <= triggerBox!.x ||
    triggerBox!.x + triggerBox!.width <= retryBox!.x ||
    retryBox!.y + retryBox!.height <= triggerBox!.y ||
    triggerBox!.y + triggerBox!.height <= retryBox!.y;
  expect(apart).toBe(true);

  // And pressing it does what it says: the profile loads and the notice goes.
  failProfile = false;
  await retry.click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByTestId("entitled-workspace")).toBeVisible();
});

test("the phone menu keeps Sign out and profile on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Workspace menu" });
  await expect(menu).toBeVisible();
  const profile = menu.getByRole("button", { name: /^(Edit|Set up) profile$/ });
  await expect(profile).toBeInViewport({ ratio: 1 });
  // Sign out is the last control in the menu, so it is the first to be pushed
  // off the bottom of a short screen.
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeInViewport({ ratio: 1 });
  // The last destination is reachable by scrolling the list, not cut off.
  const last = menu.getByRole("link", { name: "Edge Playbook", exact: true });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport({ ratio: 1 });
});
