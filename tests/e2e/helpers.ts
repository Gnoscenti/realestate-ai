import type { Page } from "@playwright/test";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";

/** Beta code accepted by the server outside production (see billing/entitlement.server.ts). */
export const TEST_ACCESS_CODE = "RSF-BETA-01";

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
      .getByRole("button", { name: /Add profile \(optional\)|Set up profile|Edit profile/i })
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

/**
 * Unlock the workspace the way a tester does: redeem a beta code through the
 * paywall, which the SERVER validates and records. Auth is disabled in
 * Playwright, so the workspace is the documented dev-user fixture; a code
 * already redeemed by that workspace simply shows the app on the next load.
 */
export async function grantTestAccess(page: Page) {
  const appVisible = page.getByTestId("entitled-workspace");
  const codeInput = page.locator("#access-code");
  // A feature list inside the paywall is not evidence that the app unlocked.
  await appVisible.or(codeInput).first().waitFor({state:"visible",timeout:20_000});
  if (await appVisible.isVisible()) return;
  await codeInput.waitFor({state:"visible",timeout:15_000});
  await codeInput.fill(TEST_ACCESS_CODE);
  await page.getByRole("button", { name: "Redeem" }).click();
  await appVisible.waitFor({ state: "visible", timeout: 20_000 });
}

/**
 * Backward-compatible alias for older specs. The optional code is deliberately
 * ignored so CI never needs or consumes a live beta credential.
 */
export async function unlockWithBetaCode(page: Page, _code?: string) {
  await grantTestAccess(page);
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
