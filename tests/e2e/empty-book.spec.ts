import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  readWorkspaceState,
  resetApp,
  unlockWithBetaCode,
} from "./helpers";

test("onboarding without website starts empty (no invented inventory)", async ({
  page,
}) => {
  await resetApp(page);

  await completeOnboarding(page, {
    name: "Test Agent",
    area: "La Jolla, CA",
  });

  await page.getByRole("button", { name: /Launch workspace/i }).click();
  await unlockWithBetaCode(page);

  const state = await readWorkspaceState(page);
  expect(state).toBeTruthy();
  expect(state!.name).toBe("Test Agent");
  expect(state!.props).toBe(0);
  expect(state!.leads).toBe(0);
  expect(state!.seedLeads).toBe(false);
});
