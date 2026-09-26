import { expect, test } from "@playwright/test";
import { grantTestAccess, resetApp, completeOnboarding } from "./helpers";

test.beforeEach(async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
});

test("CiteLock explains what it measures and asks for a profile before running anything", async ({ page }) => {
  const link = page.getByRole("link", { name: "CiteLock", exact: true });
  await expect(link).toBeVisible();
  await link.click();
  await page.getByRole("button", {name:"Advanced workspace",exact:true}).click();

  await expect(page).toHaveURL(/\/aieo\/?$/);
  await expect(
    page.getByRole("heading", {
      name: /Get discovered for the work you do best/,
    }),
  ).toBeVisible();
  // No profile yet: the page asks for setup instead of running a paid batch.
  await expect(page.getByText("Set up your profile to start")).toBeVisible();
  await expect(page.locator("#citelock-agent-name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save subject", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Where you show up", exact: true }).click();
  await expect(page.getByText(/No visibility batch yet/)).toBeVisible();

  await page.getByRole("button", { name: "What to fix", exact: true }).click();
  await expect(page.getByText("Run a visibility batch first.")).toBeVisible();

  await page.getByRole("button", { name: "Readiness", exact: true }).click();
  await expect(page.getByText("CiteScore readiness", { exact: true })).toBeVisible();
  await expect(page.locator("#citelock-jurisdiction")).toHaveValue("US-CA");
  await expect(page.getByRole("button", { name: "Run verified scan" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy schema" })).toBeDisabled();
  await expect(page.getByText(/Complete every publishing gate/)).toBeVisible();

  await page.getByRole("button", { name: "Evidence locker", exact: true }).click();
  await expect(page.getByText("license", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true }).first()).toBeVisible();
});

test("Social desk loads from the server with truthful empty states", async ({ page }) => {
  await page.getByRole("link", { name: "Social Desk", exact: true }).click();
  await expect(page).toHaveURL(/\/marketing\/?$/);
  await expect(page.getByRole("heading", { name: /Draft from facts/ })).toBeVisible();
  await expect(page.getByText(/No drafts yet/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Connect and list channels/ })).toBeDisabled();

  // Compose a draft without AI, save it, approve it, hand it off.
  await page.locator("#social-facts").fill("Open house Saturday 1-3 PM (I set this)");
  await page.locator("#social-title").fill("Open house test");
  await page.locator("#social-caption").fill("Open house Saturday 1-3 PM at my listing. Message me for the address.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Editing rev 1")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("checkbox", {name:/I reviewed the facts, source attribution/}).check();
  await page.getByRole("button", { name: /Approve facts, rights, and text/ }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Manual handoff", {exact:true})).toBeVisible();
  await page.getByRole("button", { name: "I'll post this myself" }).click();
  await expect(page.locator("#social-receipt")).toBeVisible({ timeout: 15_000 });
  await page.locator("#social-receipt").fill("https://www.instagram.com/p/abc123/");
  await page.getByRole("button", { name: "Record receipt" }).click();
  await expect(page.getByText("Posted (reported)").first()).toBeVisible({ timeout: 15_000 });
});

test("Expertise evidence requires explicit rights and survives a browser reload",async({page})=>{
  await completeOnboarding(page,{name:"Jordan Rivera",website:"https://jordanrivera.example",area:"Rancho Santa Fe, CA",brokerage:"Pacific Coast Realty"});
  await page.getByRole("button",{name:/Launch workspace/i}).click();
  await page.getByRole("button",{name:/Continue without website scan/i}).click();
  await page.getByRole("button",{name:/Launch workspace/i}).click();
  await expect(page.getByRole("heading",{name:"Finish your profile"})).not.toBeVisible();
  await page.getByRole("link",{name:"CiteLock",exact:true}).click();
  await page.getByRole("button",{name:"Advanced workspace",exact:true}).click();
  await page.getByRole("button",{name:"Save subject",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Supported expertise",exact:true})).toBeVisible();
  await page.locator("#expertise-kind").selectOption("case_material");
  await page.locator("#expertise-topic").selectOption("rural");
  const label="Authorized browser case "+Date.now();
  const statement="Jordan Rivera coordinated rural property inspections and explained the septic report. Synthetic case "+Date.now()+".";
  await page.locator("#expertise-sourceLabel").fill(label);
  await page.locator("#expertise-excerpt").fill(statement);
  await page.locator("#expertise-statement").fill(statement);
  await page.locator("#expertise-permissionNote").fill("Synthetic browser test material with permission.");
  await expect(page.getByRole("button",{name:"Save expertise evidence"})).toBeDisabled();
  await page.getByRole("checkbox",{name:/I checked that this source concerns/}).check();
  await page.getByRole("checkbox",{name:/I have permission to republish/}).check();
  await page.getByRole("button",{name:"Save expertise evidence"}).click();
  await expect(page.getByText(label,{exact:true})).toBeVisible();
  await expect(page.getByText("Source-supported",{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"Advanced workspace",exact:true}).click();
  await expect(page.getByText(label,{exact:true})).toBeVisible();
  await page.locator("#citelock-entity").selectOption("team");
  await expect(page.getByText(label,{exact:true})).not.toBeVisible();
  await expect(page.getByTestId("run-visibility-batch")).toBeDisabled();
  await page.locator("#citelock-organization-name").fill("Pacific Coastal Team");
  await page.locator("#citelock-organization-website").fill("https://pacificcoastal.example");
  await page.locator("#citelock-area").fill("San Diego County, CA");
  await page.getByRole("button",{name:"Save subject",exact:true}).click();
  await expect(page.getByText("No evidence yet. Insufficient evidence means unknown, not poor service.")).toBeVisible();
  await page.reload();
  await page.getByRole("button",{name:"Advanced workspace",exact:true}).click();
  await expect(page.locator("#citelock-entity")).toHaveValue("team");
  await expect(page.locator("#citelock-organization-name")).toHaveValue("Pacific Coastal Team");
  await page.locator("#citelock-entity").selectOption("agent");
  await expect(page.getByText(label,{exact:true})).toBeVisible();
});


test("Market scenarios use explicit assumptions and expose the live-data alternative",async({page})=>{
  await page.goto("/market");
  await expect(page.getByText("Enter all six assumptions to calculate the scenario.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Search live data"})).toBeVisible();
  const inputs={purchase:"500000",renovation:"50000",afterValue:"580000",monthlyRent:"3000",expenses:"8000",vacancy:"5"};
  for(const [key,value] of Object.entries(inputs)) await page.locator("#scenario-"+key).fill(value);
  await expect(page.getByText("$26,200",{exact:true})).toBeVisible();
  await expect(page.getByText("4.76%",{exact:true})).toBeVisible();
  await expect(page.getByText("Live suite",{exact:true})).toHaveCount(0);
  await page.locator("#scenario-vacancy").fill("101");
  await expect(page.getByRole("alert")).toContainText("between 0 and 100%");
  await expect(page.getByText("$26,200",{exact:true})).toHaveCount(0);
});
