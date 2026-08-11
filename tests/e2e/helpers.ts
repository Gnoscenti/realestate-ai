import type { Page } from "@playwright/test";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-scope";

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
  await page.getByText("Set up your Agent OS").waitFor({ timeout: 20_000 });
  await page.locator("#agent-name").fill(opts.name);
  if (opts.brokerage) {
    await page.locator("#brokerage").fill(opts.brokerage);
  }
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator("#area").fill(opts.area);
  if (opts.website) {
    await page.locator("#website").fill(opts.website);
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // MLS board step
  await page.getByRole("button", { name: "Continue" }).click();
}

export async function unlockWithBetaCode(page: Page, code = "RSF-BETA-01") {
  // Paywall may or may not show depending on prior state
  await page.waitForTimeout(600);
  const body = await page.locator("body").innerText();
  if (!/Unlock|trial|beta|\$9\.99|Access/i.test(body)) {
    return; // already in app
  }

  const inputs = page.locator("input");
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    const ph = (await inputs.nth(i).getAttribute("placeholder")) || "";
    const name = (await inputs.nth(i).getAttribute("name")) || "";
    if (/code|beta|RSF|access/i.test(ph + name)) {
      await inputs.nth(i).fill(code);
      break;
    }
  }

  const buttons = page.getByRole("button");
  const bc = await buttons.count();
  for (let i = 0; i < bc; i++) {
    const t = (await buttons.nth(i).innerText()).trim();
    if (/redeem|apply|unlock|activate/i.test(t)) {
      await buttons.nth(i).click();
      await page.waitForTimeout(800);
      return;
    }
  }

  // Demo intro fallback
  for (let i = 0; i < bc; i++) {
    const t = (await buttons.nth(i).innerText()).trim();
    if (/intro|start|continue|\$9\.99/i.test(t)) {
      await buttons.nth(i).click();
      await page.waitForTimeout(800);
      return;
    }
  }
}

export async function readWorkspaceState(page: Page) {
  return page.evaluate((workspaceKey) => {
    const scopedKey = Object.keys(localStorage).find((x) =>
      x.startsWith(`${workspaceKey}:`),
    );
    const legacyKey = Object.keys(localStorage).find((x) => x === workspaceKey);
    const k = scopedKey ?? legacyKey ?? null;
    if (!k) return null;
    try {
      const raw = JSON.parse(localStorage.getItem(k) || "{}");
      const s = raw.state ?? raw;
      return {
        key: k,
        name: s.agentProfile?.name as string | undefined,
        phone: s.agentProfile?.phone as string | undefined,
        photo: Boolean(s.agentProfile?.photoUrl),
        agentMlsId: s.agentProfile?.agentMlsId as string | undefined,
        source: s.agentProfile?.dataSource as string | undefined,
        props: (s.properties as unknown[] | undefined)?.length ?? 0,
        leads: (s.leads as unknown[] | undefined)?.length ?? 0,
        propTitles: ((s.properties as { title?: string; address?: string }[]) ||
          [])
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
    } catch {
      return null;
    }
  }, WORKSPACE_STORAGE_BASE_KEY);
}
