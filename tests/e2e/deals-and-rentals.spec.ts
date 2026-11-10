import { expect, test, type Page } from "@playwright/test";
import { grantTestAccess, readWorkspaceState, resetApp } from "./helpers";

/**
 * Transaction Hub and Property Management were empty for every real account:
 * nothing could create a deal or a rental unit. These walk the whole life of a
 * record an agent types in, including the places that used to print nonsense
 * for one ("Invalid Date", "$0", a dangling "Unit").
 */

async function openWorkspace(page: Page) {
  await resetApp(page);
  await grantTestAccess(page);
}

/** What the browser has saved, read straight from storage. */
async function savedCounts(page: Page) {
  const state = await readWorkspaceState(page);
  if (!state) return { deals: 0, rentals: 0 };
  return page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    const saved = raw.state ?? raw;
    return {
      deals: (saved.deals as unknown[] | undefined)?.length ?? 0,
      rentals: (saved.rentals as unknown[] | undefined)?.length ?? 0,
    };
  }, state.key);
}

const NONSENSE = /Invalid Date|NaN|undefined|\$0\b/;

test("an agent can add, move, edit and delete a deal, and it survives a reload", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/transactions", { waitUntil: "networkidle" });
  const main = page.getByRole("main");
  await expect(main.getByText("No deals yet")).toBeVisible();
  await expect(main.getByText("Saved on this device", { exact: true })).toBeVisible();

  // The empty state leads straight into the form, and the form starts empty.
  await main.getByRole("button", { name: "Add your first deal" }).click();
  const form = page.getByRole("dialog", { name: "Add deal" });
  await expect(form.getByLabel("Property")).toHaveValue("");
  await expect(form.getByLabel("Price ($)")).toHaveValue("");
  await expect(form.getByLabel("Stage")).toHaveValue("");

  // One named problem at a time, and nothing is saved until the form is right.
  await form.getByRole("button", { name: "Add deal", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Enter the property address or name.");
  await form.getByLabel("Property").fill("12 Harbor Way");
  await form.getByLabel("Client name").fill("Dana Whitfield");
  await form.getByLabel("Price ($)").fill("850000");
  await form.getByRole("button", { name: "Add deal", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose the stage this deal is in.");
  expect((await savedCounts(page)).deals).toBe(0);

  await form.getByLabel("Stage").selectOption("under_contract");
  await form.getByLabel("Closing date (optional)").fill("2027-01-15");
  await form.getByRole("button", { name: "Add deal", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText("Deal saved on this device")).toBeVisible();

  await expect(main.getByText("12 Harbor Way").first()).toBeVisible();
  await expect(main.getByText(/Dana Whitfield · \$850,000 · closes Jan 15, 2027/)).toBeVisible();
  // Every stage is always listed once as a step; the current one is also the card's badge.
  await expect(main.getByText("Under contract", { exact: true })).toHaveCount(2);
  await expect(main.getByText("Inspection", { exact: true })).toHaveCount(1);
  await expect(main).not.toContainText(NONSENSE);
  expect((await savedCounts(page)).deals).toBe(1);

  // Saved in the browser: still there after a reload.
  await page.reload({ waitUntil: "networkidle" });
  await expect(main.getByText(/Dana Whitfield · \$850,000 · closes Jan 15, 2027/)).toBeVisible();

  // The other tabs say something true about a deal with no documents.
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(main.getByText("No documents are recorded for this deal.", { exact: false })).toBeVisible();
  await page.getByRole("tab", { name: "E-signature" }).click();
  await expect(main.getByText("No documents on your deals")).toBeVisible();
  await page.getByRole("tab", { name: "Milestones" }).click();

  await main.getByRole("button", { name: "Move to next stage" }).click();
  await expect(main.getByText("Inspection", { exact: true })).toHaveCount(2);
  await expect(main.getByText("Under contract", { exact: true })).toHaveCount(1);

  // Edit opens the same form, filled in. The stage can go back, and the date can be cleared.
  await main.getByRole("button", { name: "Edit deal: 12 Harbor Way" }).click();
  const edit = page.getByRole("dialog", { name: "Edit deal" });
  await expect(edit.getByLabel("Property")).toHaveValue("12 Harbor Way");
  await expect(edit.getByLabel("Price ($)")).toHaveValue("850000");
  await expect(edit.getByLabel("Stage")).toHaveValue("inspection");
  await expect(edit.getByLabel("Closing date (optional)")).toHaveValue("2027-01-15");
  await edit.getByLabel("Stage").selectOption("offer");
  await edit.getByLabel("Closing date (optional)").fill("");
  await edit.getByLabel("Price ($)").fill("875000");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  await expect(main.getByText(/Dana Whitfield · \$875,000 · no closing date set/)).toBeVisible();
  await expect(main).not.toContainText(NONSENSE);
  expect((await savedCounts(page)).deals).toBe(1);

  // It reaches the Command Center, worded from what was entered.
  await page.goto("/", { waitUntil: "networkidle" });
  const priority = page.getByRole("button", { name: /Advance Dana Whitfield's deal/ });
  await expect(priority).toBeVisible();
  await expect(priority).toContainText("Offer · $875,000");
  await priority.click();
  await expect(page.getByText(/Hi Dana, quick update on 12 Harbor Way: we're at the offer stage\./)).toBeVisible();
  // A deal that is not linked to a listing gets no comparison notes for some other property.
  await expect(page.getByText("Listing comparison notes")).toHaveCount(0);

  // Delete asks first, names the deal, and "Keep" really keeps.
  await page.goto("/transactions", { waitUntil: "networkidle" });
  await main.getByRole("button", { name: "Delete deal: 12 Harbor Way" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this deal?" });
  await expect(confirm).toContainText(
    "12 Harbor Way for Dana Whitfield will be removed from Transaction Hub. This can't be undone.",
  );
  await confirm.getByRole("button", { name: "Keep deal" }).click();
  await expect(confirm).toBeHidden();
  expect((await savedCounts(page)).deals).toBe(1);

  await main.getByRole("button", { name: "Delete deal: 12 Harbor Way" }).click();
  await confirm.getByRole("button", { name: "Delete deal", exact: true }).click();
  await expect(main.getByText("No deals yet")).toBeVisible();
  expect((await savedCounts(page)).deals).toBe(0);
  await page.reload({ waitUntil: "networkidle" });
  await expect(main.getByText("No deals yet")).toBeVisible();
});

test("an agent can add a rental unit, record a lease, apply a market rent and delete it", async ({
  page,
}) => {
  await openWorkspace(page);
  await page.goto("/properties", { waitUntil: "networkidle" });
  const main = page.getByRole("main");
  await expect(main.getByText("No rental units yet")).toBeVisible();

  await main.getByRole("button", { name: "Add your first unit" }).click();
  const form = page.getByRole("dialog", { name: "Add rental unit" });
  await expect(form.getByLabel("Status")).toHaveValue("");
  // Rent, tenant and lease are not asked until the unit is rented.
  await expect(form.getByLabel("Monthly rent ($)")).toHaveCount(0);

  await form.getByLabel("Street address").fill("40 Juniper St");
  await form.getByLabel("Bedrooms").fill("2");
  await form.getByLabel("Bathrooms").fill("1.5");
  await form.getByRole("button", { name: "Add unit", exact: true }).click();
  await expect(form.getByRole("alert")).toHaveText("Choose a status: occupied, vacant or notice given.");

  // A vacant unit, with no unit number, square footage or market rent.
  await form.getByLabel("Status").selectOption("vacant");
  await form.getByRole("button", { name: "Add unit", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText("Rental unit saved on this device")).toBeVisible();
  expect((await savedCounts(page)).rentals).toBe(1);

  await expect(main.getByText("40 Juniper St").first()).toBeVisible();
  await expect(main.getByText("2bd / 1.5ba", { exact: true })).toBeVisible();
  await expect(main.getByText("Vacant", { exact: true })).toBeVisible();
  // Nothing was entered for these, so nothing is shown for them.
  await expect(main).not.toContainText("· Unit");
  await expect(main).not.toContainText("sqft");
  await expect(main).not.toContainText("Maintenance health");
  await expect(main).not.toContainText(/NaN|undefined|Invalid Date/);
  await expect(main.getByText("0%", { exact: true })).toBeVisible();
  await expect(main.getByText("0 occupied · 1 vacant")).toBeVisible();

  // The Command Center lists the vacancy without a made-up market rent.
  await page.goto("/", { waitUntil: "networkidle" });
  const vacancy = page.getByRole("button", { name: /Fill vacancy · 40 Juniper St/ });
  await expect(vacancy).toBeVisible();
  await expect(vacancy).toContainText("No market rent estimate saved");

  // "Record lease" is the edit form, already set to Occupied.
  await page.goto("/properties", { waitUntil: "networkidle" });
  await main.getByRole("button", { name: "Record lease" }).click();
  const edit = page.getByRole("dialog", { name: "Edit rental unit" });
  await expect(edit.getByLabel("Status")).toHaveValue("occupied");
  await expect(edit.getByLabel("Street address")).toHaveValue("40 Juniper St");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit.getByRole("alert")).toHaveText("Enter the monthly rent as a number greater than 0.");
  await edit.getByLabel("Monthly rent ($)").fill("2400");
  await edit.getByLabel("Tenant name (optional)").fill("Priya Nair");
  await edit.getByLabel("Lease end date (optional)").fill("2027-03-31");
  await edit.getByLabel("Unit (optional)").fill("2B");
  await edit.getByLabel("Market rent estimate ($ per month, optional)").fill("3000");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();

  await expect(main.getByText("Occupied", { exact: true })).toBeVisible();
  await expect(main.getByText("· Unit 2B")).toBeVisible();
  await expect(main.getByText("Priya Nair")).toBeVisible();
  await expect(main.getByText("100%", { exact: true })).toBeVisible();
  await expect(main.getByText("1 occupied · 0 vacant")).toBeVisible();
  await expect(main.getByText("$2,400/mo")).toBeVisible();
  // $600 under the agent's own estimate, which is more than 5%.
  await expect(main.getByText("$600/mo")).toBeVisible();

  await page.reload({ waitUntil: "networkidle" });
  await expect(main.getByText("Priya Nair")).toBeVisible();
  const lease = await main.getByText(/^3\/31\/2027$|^31\/0?3\/2027$|2027/).first().textContent();
  expect(lease).toContain("2027");

  await main.getByRole("button", { name: /Apply market rent/ }).click();
  await expect(main.getByText("$3,000/mo")).toBeVisible();
  await expect(main.getByRole("button", { name: /Apply market rent/ })).toHaveCount(0);

  // On notice is counted, so the three figures add up to the number of units.
  await main.getByRole("button", { name: "Edit unit: 40 Juniper St, Unit 2B" }).click();
  await edit.getByLabel("Status").selectOption("notice");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(main.getByText("0 occupied · 1 on notice · 0 vacant")).toBeVisible();

  // Back to vacant: rent, tenant and lease go with it.
  await main.getByRole("button", { name: "Edit unit: 40 Juniper St, Unit 2B" }).click();
  await edit.getByLabel("Status").selectOption("vacant");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(main.getByText("Vacant", { exact: true })).toBeVisible();
  await expect(main).not.toContainText("Priya Nair");
  await expect(main.getByText("$0/mo").first()).toBeVisible(); // the Current rent total, now truly zero

  await main.getByRole("button", { name: "Delete unit: 40 Juniper St, Unit 2B" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete this rental unit?" });
  await expect(confirm).toContainText(
    "40 Juniper St, Unit 2B will be removed from Property Management. This can't be undone.",
  );
  await confirm.getByRole("button", { name: "Keep unit" }).click();
  expect((await savedCounts(page)).rentals).toBe(1);
  await main.getByRole("button", { name: "Delete unit: 40 Juniper St, Unit 2B" }).click();
  await confirm.getByRole("button", { name: "Delete unit", exact: true }).click();
  await expect(main.getByText("No rental units yet")).toBeVisible();
  expect((await savedCounts(page)).rentals).toBe(0);
});

test("the add forms fit a phone screen and can be completed with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await openWorkspace(page);

  for (const target of [
    { path: "/transactions", open: "Add deal", dialog: "Add deal", submit: "Add deal" },
    { path: "/properties", open: "Add unit", dialog: "Add rental unit", submit: "Add unit" },
  ]) {
    await page.goto(target.path, { waitUntil: "networkidle" });
    await page.getByRole("main").getByRole("button", { name: target.open, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: target.dialog });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(667);
    // The submit button can be reached: the dialog scrolls when it is taller than the screen.
    const submit = dialog.getByRole("button", { name: target.submit, exact: true });
    await submit.scrollIntoViewIfNeeded();
    await expect(submit).toBeInViewport({ ratio: 1 });
    // Escape closes without saving anything.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  expect(await savedCounts(page)).toEqual({ deals: 0, rentals: 0 });

  // Enter in a field submits the form, like any form.
  await page.goto("/transactions", { waitUntil: "networkidle" });
  await page.getByRole("main").getByRole("button", { name: "Add deal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add deal" });
  await dialog.getByLabel("Property").fill("3 Quay Rd");
  await dialog.getByLabel("Client name").fill("Lee Okafor");
  await dialog.getByLabel("Stage").selectOption("offer");
  await dialog.getByLabel("Price ($)").fill("410000");
  await dialog.getByLabel("Price ($)").press("Enter");
  await expect(dialog).toBeHidden();
  expect((await savedCounts(page)).deals).toBe(1);
});
