import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { WORKSPACE_STORAGE_BASE_KEY } from "@/lib/auth/workspace-storage-keys";

async function signUp(page:Page) {
  await page.goto("/marketing");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await page.locator("#login-name").fill("Isolated Browser Agent");
  await page.locator("#login-email").fill("browser-"+randomUUID()+"@example.test");
  await page.locator("#login-password").fill("Test!"+randomUUID());
  await page.getByRole("button",{name:"Create account with email"}).click();
  await expect(page.locator("#access-code")).toBeVisible();
}
async function unlock(page:Page) {
  await page.locator("#access-code").fill("TEST-ACCESS-NOT-PRODUCTION");
  await page.getByRole("button",{name:"Redeem",exact:true}).click();
  await expect(page.getByTestId("entitled-workspace")).toBeVisible();
}
test("real sessions enforce the paywall, persist social drafts and isolate another account",async({page,browser})=>{
  await signUp(page);
  await page.evaluate(base=>{
    const key=Object.keys(localStorage).find(k=>k.startsWith(base+":"));
    if(!key) throw new Error("Expected a user-scoped workspace key");
    const stored=JSON.parse(localStorage.getItem(key) || "{}");
    stored.state.billing={...stored.state.billing,status:"code",activatedAt:new Date().toISOString(),expiresAt:"2099-01-01T00:00:00.000Z"};
    localStorage.setItem(key,JSON.stringify(stored));
  },WORKSPACE_STORAGE_BASE_KEY);
  await page.route("**/_serverFn/**",route=>route.abort("failed"));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("couldn't verify your access");
  await expect(page.getByTestId("entitled-workspace")).toHaveCount(0);
  await page.unroute("**/_serverFn/**");
  await page.getByRole("button",{name:"Retry access check"}).click();
  await expect(page.locator("#access-code")).toBeVisible();
  await expect(page.getByTestId("entitled-workspace")).toHaveCount(0);
  await page.locator("#access-code").fill("NOT-A-VALID-CODE");
  await page.getByRole("button",{name:"Redeem",exact:true}).click();
  await expect(page.getByText(/Invalid code/).first()).toBeVisible();
  await unlock(page);
  await page.getByRole("link",{name:"Social Desk",exact:true}).click();
  const title="Private source note "+randomUUID();
  await page.locator("#social-facts").fill("Authorized synthetic test content about explaining inspections.");
  await page.locator("#social-title").fill(title);
  await page.locator("#social-caption").fill("Questions about an inspection report? Ask which findings need follow-up before deciding your next step.");
  await page.getByRole("button",{name:"Save draft",exact:true}).click();
  await expect(page.getByText("Editing rev 1")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{name:new RegExp(title)})).toBeVisible();

  await page.getByRole("link", {name:"CiteLock",exact:true}).click();
  await expect(page.getByRole("button",{name:"Advanced workspace",exact:true})).toBeEnabled();
  await page.route("**/_serverFn/**", route => route.abort("failed"));
  await page.getByRole("button",{name:"Advanced workspace",exact:true}).click();
  await expect(page.getByRole("button", {name:"Reload saved identities"})).toBeVisible();
  await expect(page.locator("#citelock-agent-name")).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Retry provider configuration"})).toBeVisible();
  await page.unroute("**/_serverFn/**");
  await page.getByRole("button", {name:"Reload saved identities"}).click();
  await page.getByRole("button", {name:"Retry provider configuration"}).click();
  await page.locator("#citelock-entity").selectOption("brokerage");
  const brokerage = "Saved Brokerage " + randomUUID();
  await page.locator("#citelock-organization-name").fill(brokerage);
  await page.locator("#citelock-organization-website").fill("https://brokerage.example");
  await page.locator("#citelock-area").fill("San Diego, CA");
  await page.getByRole("button", {name:"Save subject",exact:true}).click();
  await expect(page.getByText("Subject saved to your workspace.")).toBeVisible();
  const secondDevice = await browser.newContext({baseURL:new URL(page.url()).origin});
  try {
    await secondDevice.addCookies(await page.context().cookies());
    const devicePage = await secondDevice.newPage();
    await devicePage.goto("/aieo");
    await devicePage.getByRole("button",{name:"Advanced workspace",exact:true}).click();
    await expect(devicePage.locator("#citelock-entity")).toHaveValue("brokerage");
    await expect(devicePage.locator("#citelock-organization-name")).toHaveValue(brokerage);
    await expect(devicePage.getByRole("button",{name:"Edit saved subject",exact:true})).toBeVisible();
  } finally { await secondDevice.close(); }

  const other=await browser.newContext({baseURL:new URL(page.url()).origin});
  const otherPage=await other.newPage();
  try {
    await signUp(otherPage);
    await unlock(otherPage);
    await otherPage.getByRole("link",{name:"Social Desk",exact:true}).click();
    await expect(otherPage.getByText("No drafts yet.",{exact:false})).toBeVisible();
    await expect(otherPage.getByText(title,{exact:false})).toHaveCount(0);
    await otherPage.goto("/aieo");
    await otherPage.getByRole("button",{name:"Advanced workspace",exact:true}).click();
    await expect(otherPage.locator("#citelock-agent-name")).toHaveValue("");
    await otherPage.locator("#citelock-entity").selectOption("brokerage");
    await expect(otherPage.locator("#citelock-organization-name")).toHaveValue("");
  } finally {await other.close();}
  await page.context().clearCookies();
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
});


test("compiled production auth rejects unrelated loopback origins", async ({request}) => {
  test.skip(process.env.PLAYWRIGHT_PRODUCTION !== "1", "Development explicitly permits local dev origins.");
  const response = await request.post("/api/auth/sign-in/email", {
    headers: { Origin: "http://localhost:8080" },
    data: { email: "unrelated-origin@example.test", password: "not-a-real-password" },
  });
  expect(response.status()).toBe(403);
  expect(await response.text()).toContain("INVALID_ORIGIN");
});


test("free Citelock guide persists without MLS and upgrades the saved plan after server entitlement",async({page})=>{
  await signUp(page);
  await page.getByRole("link",{name:"Try the free Citelock visibility guide"}).click();
  await expect(page.getByTestId("free-workspace")).toBeVisible();
  await expect(page.getByRole("button",{name:"Advanced workspace",exact:true})).toBeDisabled();
  await page.locator("#guide-name").fill("Source Test Agent");
  await page.locator("#guide-area").fill("Wellington, New Zealand");
  await page.locator("#guide-website").fill("https://unavailable.example");
  await page.getByRole("button",{name:"Build my visibility guide"}).click();
  await expect(page.getByText("Free basic guide",{exact:true})).toBeVisible();
  await expect(page.getByText("website · unavailable",{exact:false})).toBeVisible();
  await expect(page.getByRole("checkbox",{name:/Mark step \d+ complete/})).toHaveCount(3);
  await page.getByRole("checkbox",{name:"Mark step 1 complete",exact:true}).check();
  await expect(page.getByText("1 of 3 marked complete")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("checkbox",{name:"Mark step 1 complete",exact:true})).toBeChecked();
  // A failed save must visibly roll back; reloading preserves the last confirmed state.
  await page.route("**/_serverFn/**",route=>route.abort("failed"));
  await page.getByRole("checkbox",{name:"Mark step 2 complete",exact:true}).check();
  await expect(page.getByText("That change was not saved. Retry; your prior progress is intact.")).toBeVisible();
  await expect(page.getByRole("checkbox",{name:"Mark step 2 complete",exact:true})).not.toBeChecked();
  await page.unroute("**/_serverFn/**");
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export guide"}).click();
  const download=await downloadPromise;
  const stream=await download.createReadStream(); const chunks:Buffer[]=[];
  for await(const chunk of stream!) chunks.push(Buffer.from(chunk));
  const text=Buffer.concat(chunks).toString("utf8");
  expect(text).toContain("Wellington, New Zealand");
  expect(text).toContain("unavailable");
  expect(text).not.toContain("Give your editor a practical discovery checklist");
  await page.getByRole("link",{name:"View full access",exact:true}).click();
  await unlock(page);
  await page.goto("/aieo");
  await expect(page.getByText("Full guide",{exact:true})).toBeVisible();
  await expect(page.getByRole("checkbox",{name:/Mark step \d+ complete/})).toHaveCount(9);
  await expect(page.getByRole("checkbox",{name:"Mark step 1 complete",exact:true})).toBeChecked();
  await expect(page.getByRole("button",{name:"Advanced workspace",exact:true})).toBeEnabled();
});
