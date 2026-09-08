import { expect, test } from "@playwright/test";
import { SEED_LEADS, SEED_PROPERTIES } from "../../src/data/seed";
import { answerFaq } from "../../src/lib/faq-assistants";
import { WORKSPACE_STORAGE_BASE_KEY } from "../../src/lib/auth/workspace-storage-keys";
import { grantTestAccess, resetApp } from "./helpers";

test("showing messages require the chosen property and preserve email subjects", async ({ page, context }) => {
  await resetApp(page);
  await grantTestAccess(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(({ key, leads, properties }) => {
    const storageKey = `${key}:dev-user`;
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    saved.state = { ...saved.state, leads, properties };
    localStorage.setItem(storageKey, JSON.stringify(saved));
  }, {
    key: WORKSPACE_STORAGE_BASE_KEY,
    leads: SEED_LEADS.slice(0, 2).map((lead, index) => ({
      ...lead, id: `outreach-regression-lead-${index}`,
      name: index ? "Second Test Client" : "First Test Client",
      email: `client-${index}@example.test`, status: "new", score: 90 - index,
    })),
    properties: SEED_PROPERTIES.slice(0, 2).map((property, index) => ({
      ...property, id: `outreach-regression-property-${index}`,
      title: index ? "Chosen Tour Home" : "Unrelated First Home",
    })),
  });
  await page.goto("/outreach?mode=showing");
  await expect(page.getByLabel("Showing property")).toHaveValue("");
  await expect(page.getByTestId("showing-touch-post-24h")).toHaveCount(0);
  await page.getByLabel("Showing property").selectOption("outreach-regression-property-1");
  const email = page.getByTestId("showing-touch-post-24h");
  await expect(email).toContainText("Chosen Tour Home");
  await expect(email).not.toContainText("Unrelated First Home");
  await email.getByRole("button", { name: "Copy", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Subject: Chosen Tour Home/);
  expect(copied).toContain("Thanks for touring Chosen Tour Home");
  await page.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: /Second Test Client/ }).click();
  await expect(page.getByLabel("Showing property")).toHaveValue("");
  await expect(page.getByTestId("showing-touch-post-24h")).toHaveCount(0);

  await page.getByRole("tab", { name: /FAQ/ }).click();
  await page.getByRole("button", { name: "Copy answer", exact: true }).click();
  const faqCopy = await page.evaluate(() => navigator.clipboard.readText());
  const faq = answerFaq("Do I need a pre-approval before touring?");
  expect(faqCopy).toContain(faq.answer);
  expect(faqCopy).toContain(faq.disclaimer);
});
