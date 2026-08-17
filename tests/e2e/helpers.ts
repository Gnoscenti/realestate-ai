import type { Page } from "@playwright/test";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";

/** Clear persisted workspace so each test starts fresh */
export async function resetApp(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) =>
      k.includes("realestate"),
    );
    for (const k of keys) localStorage.removeItem(k);
    localStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
}

export async function completeOnboarding(
  page: Page,
  opts: {
    name: string;
    area: string;
    website?: string;
    brokerage?: string;
  },
) {
  // New beta entry flow opens access/workspace first. Profile setup starts only
  // when the tester chooses it from inside the app.
  const heading = page.getByRole("heading", { name: "Finish your profile" });
  if (!(await heading.isVisible().catch(() => false))) {
    await grantTestAccess(page);
    const setup = page
      .getByRole("button", { name: /Set up profile \/ MLS|Edit profile \/ MLS/i })
      .first();
    await setup.waitFor({ state: "visible", timeout: 20_000 });
    await setup.click();
  }

  await heading.waitFor({ timeout: 20_000 });
  await page.locator("#agent-name").fill(opts.name);
  if (opts.brokerage) {
    await page.locator("#brokerage").fill(opts.brokerage);
  }
  await page.locator("#area").fill(opts.area);
  if (opts.website) {
    await page.locator("#website").fill(opts.website);
  }
}

export async function grantTestAccess(page: Page) {
  // Integration tests exercise the access boundary without publishing or
  // consuming a real beta credential. Auth is disabled in Playwright, so the
  // workspace is deterministically scoped to the documented dev-user fixture.
  await page.waitForTimeout(600);
  const body = await page.locator("body").innerText();
  if (!/Unlock|trial|beta|\$9\.99|Access/i.test(body)) return;

  await page.evaluate((workspaceStorageBaseKey) => {
    const key = `${workspaceStorageBaseKey}:dev-user`;
    const raw = window.localStorage.getItem(key);
    let persisted: { state?: Record<string, unknown>; version?: number } = {};
    try {
      persisted = raw ? JSON.parse(raw) : {};
    } catch {
      persisted = {};
    }

    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const currentState =
      persisted.state && typeof persisted.state === "object"
        ? persisted.state
        : {};
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...persisted,
        state: {
          ...currentState,
          billing: {
            status: "trialing",
            source: "demo_checkout",
            introEndsAt: end.toISOString(),
            currentPeriodEnd: end.toISOString(),
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            lastCheckoutSessionId: "playwright-fixture",
            redeemedCode: null,
            activatedAt: now.toISOString(),
            isDemo: true,
          },
        },
        version: persisted.version ?? 0,
      }),
    );
  }, WORKSPACE_STORAGE_BASE_KEY);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
}

export async function readWorkspaceState(page: Page) {
  return page.evaluate((workspaceStorageBaseKey) => {
    const entries = Object.keys(localStorage)
      .filter(
        (key) =>
          key === workspaceStorageBaseKey ||
          key.startsWith(`${workspaceStorageBaseKey}:`),
      )
      .flatMap((key) => {
        try {
          const raw = JSON.parse(localStorage.getItem(key) || "{}");
          return [{ key, state: raw.state ?? raw }];
        } catch {
          return [];
        }
      });
    const workspace =
      entries.find(({ state }) => state.onboarded || state.agentProfile) ??
      entries[0];
    if (!workspace) return null;

    const { key, state: s } = workspace;
    return {
      key,
      name: s.agentProfile?.name as string | undefined,
      phone: s.agentProfile?.phone as string | undefined,
      brokerage: s.agentProfile?.brokerage as string | undefined,
      photo: Boolean(s.agentProfile?.photoUrl),
      agentMlsId: s.agentProfile?.agentMlsId as string | undefined,
      source: s.agentProfile?.dataSource as string | undefined,
      props: (s.properties as unknown[] | undefined)?.length ?? 0,
      leads: (s.leads as unknown[] | undefined)?.length ?? 0,
      propTitles: ((s.properties as { title?: string; address?: string }[]) || [])
        .slice(0, 6)
        .map((p) => p.title || p.address),
      seedLeads: ((s.leads as { name?: string; email?: string }[]) || []).some(
        (l) =>
          /Sarah Johnson|Mike Chen|Emily Rodriguez|David Park/.test(
            l.name || "",
          ) || /@email\.com$/i.test(l.email || ""),
      ),
      onboarded: Boolean(s.onboarded),
      access: s.billing?.status as string | undefined,
    };
  }, WORKSPACE_STORAGE_BASE_KEY);
}
