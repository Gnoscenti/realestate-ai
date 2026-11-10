import { expect, test, type Page } from "@playwright/test";
import { grantTestAccess, readWorkspaceState, resetApp } from "./helpers";

/**
 * Screens that used to claim more than the code does: an inbox "connection"
 * that never existed, a budget nobody entered, and "AI" on features that are
 * counters and keyword rules.
 */

async function openWorkspace(page: Page) {
  await resetApp(page);
  await grantTestAccess(page);
}

test("Email Alerts offers a one-time Gmail scan and nothing it cannot do", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/alerts", { waitUntil: "networkidle" });
  const main = page.getByRole("main");

  await expect(main.getByRole("heading", { name: "Email Alerts" })).toBeVisible();
  await expect(main.getByText("One-time Gmail scan")).toBeVisible();
  await expect(main.getByText("No scan has finished in this browser.")).toBeVisible();
  await expect(
    main.getByText("No alerts. Alerts appear here after a Gmail scan finds matching emails."),
  ).toBeVisible();

  // No connection to make, no provider to pick, no address that is never used.
  await expect(main.getByRole("button", { name: /connect/i })).toHaveCount(0);
  await expect(main.getByRole("combobox")).toHaveCount(0);
  await expect(main.getByLabel(/inbox email/i)).toHaveCount(0);
  await expect(main).not.toContainText(/demo pass|optional|smart|live inbox|connected inbox/i);
  // Exactly one way to start a scan, and it sits next to the field it needs.
  await expect(main.getByRole("button", { name: /scan/i })).toHaveCount(1);

  // Without a token the page says so beside the field, and nothing is created.
  await main.getByRole("button", { name: "Scan Gmail" }).click();
  await expect(main.getByRole("alert")).toHaveText(
    "Paste a Gmail access token first. Nothing is scanned without one.",
  );
  await expect(main.getByLabel("Gmail access token")).toHaveAttribute("aria-invalid", "true");
  await expect(main.getByText("No scan has finished in this browser.")).toBeVisible();
  await expect(
    main.getByText("No alerts. Alerts appear here after a Gmail scan finds matching emails."),
  ).toBeVisible();
  // No unread count beside the page's name in the menu.
  await expect(
    page.getByRole("complementary").getByRole("link", { name: /Email Alerts/ }),
  ).toHaveText("Email Alerts");

  // Typing clears the message.
  await main.getByLabel("Gmail access token").fill("x");
  await expect(main.getByRole("alert")).toHaveCount(0);
});

test("made-up alerts saved by an older build are removed on load", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/alerts", { waitUntil: "networkidle" });
  const state = await readWorkspaceState(page);
  expect(state).not.toBeNull();

  await page.evaluate((key) => {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    const saved = raw.state ?? raw;
    saved.emailAlerts = [
      {
        id: "ealert_old",
        kind: "docusign",
        from: "DocuSign",
        fromEmail: "dse@docusign.net",
        subject: "Complete with DocuSign: Purchase Agreement",
        snippet: "Please review and sign.",
        receivedAt: new Date().toISOString(),
        read: false,
        priority: "critical",
        provider: "gmail",
        messageId: "demo_ds_1",
        actionLabel: "Open Instant Response",
        href: "/outreach",
      },
    ];
    localStorage.setItem(key, JSON.stringify(raw.state ? raw : { state: saved, version: 0 }));
    // What a build before the token was kept out of storage left behind.
    localStorage.setItem("realestate-ai-email-token", "ya29.old-token");
  }, state!.key);

  await page.reload({ waitUntil: "networkidle" });
  const main = page.getByRole("main");
  await expect(
    main.getByText("No alerts. Alerts appear here after a Gmail scan finds matching emails."),
  ).toBeVisible();
  await expect(main).not.toContainText("Complete with DocuSign");
  // It is not counted either: not in the menu, not on the browser tab.
  await expect(
    page.getByRole("complementary").getByRole("link", { name: /Email Alerts/ }),
  ).toHaveText("Email Alerts");
  await expect(page).not.toHaveTitle(/^\(\d+\)/);
  expect(await page.evaluate(() => localStorage.getItem("realestate-ai-email-token"))).toBeNull();
});

test("a new lead starts with no budget, location or note it was not given", async ({ page }) => {
  await openWorkspace(page);
  await page.goto("/leads", { waitUntil: "networkidle" });
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Add your first lead" }).click();
  const dialog = page.getByRole("dialog", { name: "Add lead" });

  // Nothing is filled in for the agent.
  await expect(dialog.getByLabel("Lowest budget ($)")).toHaveValue("");
  await expect(dialog.getByLabel("Highest budget ($)")).toHaveValue("");
  await expect(dialog.getByLabel("Property type")).toHaveValue("");
  await expect(dialog.getByText("Leave the budget blank if you don't know it yet.")).toBeVisible();

  await dialog.getByLabel("Name", { exact: true }).fill("Robin Vale");
  await dialog.getByLabel("Phone", { exact: true }).fill("(858) 555-0101");

  // A range entered the wrong way round is caught, not saved.
  await dialog.getByLabel("Lowest budget ($)").fill("900000");
  await dialog.getByLabel("Highest budget ($)").fill("500000");
  await dialog.getByRole("button", { name: "Add lead", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "The lowest budget is more than the highest budget. Swap them or correct one.",
  );
  await dialog.getByLabel("Lowest budget ($)").fill("");
  await dialog.getByLabel("Highest budget ($)").fill("");
  await dialog.getByRole("button", { name: "Add lead", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(main.getByText("Robin Vale").first()).toBeVisible();
  await expect(main.getByText("No budget entered")).toBeVisible();
  await expect(main).not.toContainText(/\$0|\$500|\$900|Metro|AI scoring/);

  // The same lead on Instant Response: the draft and the summary use only what is saved.
  await page.goto("/outreach", { waitUntil: "networkidle" });
  await expect(main.getByText("Not entered", { exact: true })).toBeVisible();
  await expect(main.getByText("No location entered")).toBeVisible();
  await expect(main).not.toContainText(/\$0|Metro|around \.| in \./);

  // With a ceiling only, the budget reads as a ceiling.
  await page.goto("/leads", { waitUntil: "networkidle" });
  await main.getByRole("button", { name: "Add lead", exact: true }).click();
  await dialog.getByLabel("Name", { exact: true }).fill("Ines Moreau");
  await dialog.getByLabel("Email", { exact: true }).fill("ines@example.com");
  await dialog.getByLabel("Location").fill("Carlsbad");
  await dialog.getByLabel("Highest budget ($)").fill("900000");
  await dialog.getByRole("button", { name: "Add lead", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(main.getByText("Budget up to $900,000")).toBeVisible();
  await expect(main.getByText("up to $900K")).toBeVisible();
  await expect(main.getByText("Carlsbad").first()).toBeVisible();
});

test("counters and rules are not labelled as AI", async ({ page }) => {
  await openWorkspace(page);
  // The dashboard figures appear once there is something to count.
  await page.goto("/leads", { waitUntil: "networkidle" });
  await page.getByRole("main").getByRole("button", { name: "Add your first lead" }).click();
  const dialog = page.getByRole("dialog", { name: "Add lead" });
  await dialog.getByLabel("Name", { exact: true }).fill("Robin Vale");
  await dialog.getByLabel("Phone", { exact: true }).fill("(858) 555-0101");
  await dialog.getByRole("button", { name: "Add lead", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/", { waitUntil: "networkidle" });

  // The sidebar counter counts actions. No model reads it.
  const sidebar = page.getByRole("complementary");
  await expect(sidebar.getByText("Activity score")).toBeVisible();
  await expect(sidebar).not.toContainText("AI familiarity");

  const main = page.getByRole("main");
  await expect(main).not.toContainText(/Recent AI activity|AI lead score|AI memory/);
  // A points score out of 100, with where it comes from. Not a percentage, not AI.
  await expect(main.getByText("Average lead score")).toBeVisible();
  await expect(main.getByText("59/100")).toBeVisible();
  await expect(main.getByText("From budget, stage and source")).toBeVisible();

  await page.goto("/knowledge", { waitUntil: "networkidle" });
  await expect(main.getByRole("tab", { name: "Practice notes" })).toBeVisible();
  await expect(main).not.toContainText(/AI familiarity|AI memory|learning signals/);
  await main.getByRole("tab", { name: "Practice notes" }).click();
  await expect(main.getByText("Add a practice note")).toBeVisible();
  await expect(
    main.getByText("Saved in this browser only. The AI assistant does not read these yet."),
  ).toBeVisible();
  await expect(main).not.toContainText(/Teach the AI|has learned about you|confidence \d+%/);

  await page.goto("/search", { waitUntil: "networkidle" });
  await expect(main).not.toContainText(/Natural language|% match/);
});
