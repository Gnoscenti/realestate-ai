import { expect, test, type Page } from "@playwright/test";
import { grantTestAccess, resetApp } from "./helpers";

const INBOX_KEY = "realestate-ai-beta-inbox";

type SeedRecord = {
  id: string;
  body: string;
  globalNumber: number;
  delivery?: { state: "sent"; issueNumber: number; issueUrl: string } | { state: "unsent" };
};

async function seedInbox(page: Page, records: SeedRecord[]) {
  await page.evaluate(
    ({ key, seeded }) => {
      const base = {
        pagePath: "/calendar",
        pageTitle: "Calendar & Vendors",
        module: "calendar",
        category: "feature",
        sessionId: "s_seeded",
        sessionNumber: 1,
        createdAt: "2026-10-22T12:05:23.622Z",
      };
      localStorage.setItem(
        key,
        JSON.stringify(
          seeded.map((record) => ({
            ...base,
            ...record,
            fileName: `${String(record.globalNumber).padStart(4, "0")}-calendar.md`,
          })),
        ),
      );
    },
    { key: INBOX_KEY, seeded: records },
  );
  await page.reload();
}

/**
 * Stop Suggest submissions in the browser so this spec can never create a real
 * intake issue, whatever credentials the test server inherited. Returns the
 * bodies of the submissions that were attempted.
 */
async function blockSuggestSubmissions(page: Page): Promise<string[]> {
  const attempted: string[] = [];
  await page.route("**/_serverFn/**", async (route) => {
    const request = route.request();
    const payload = request.method() === "POST" ? request.postData() || "" : "";
    if (!payload.includes('"sessionId"') || !payload.includes('"pagePath"')) {
      await route.continue();
      return;
    }
    attempted.push(payload);
    await route.abort("failed");
  });
  return attempted;
}

async function openDrawer(page: Page) {
  await page.getByRole("button", { name: "Open beta feedback drawer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta Feedback" })).toBeVisible();
}

test("Suggest history shows delivery status and re-sends without duplicating", async ({
  page,
}) => {
  await resetApp(page);
  await grantTestAccess(page);
  const attempted = await blockSuggestSubmissions(page);
  await seedInbox(page, [
    {
      id: "feedback_sent",
      body: "Delivered idea",
      globalNumber: 3,
      delivery: {
        state: "sent",
        issueNumber: 41,
        issueUrl: "https://github.com/example/intake/issues/41",
      },
    },
    // Saved before delivery tracking existed: accepted by the server, issue unknown.
    { id: "feedback_legacy", body: "Older idea with no delivery record", globalNumber: 2 },
    // Provisional device id: the server never accepted it.
    { id: "bc_local_1_abc", body: "Never reached the server", globalNumber: 1 },
  ]);
  await openDrawer(page);

  const rows = page.getByTestId("beta-feedback-delivery");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute("data-delivery", "sent");
  await expect(rows.nth(0).getByRole("link", { name: "Sent · GitHub #41" })).toHaveAttribute(
    "href",
    "https://github.com/example/intake/issues/41",
  );
  await expect(rows.nth(0).getByRole("button")).toHaveCount(0);
  await expect(rows.nth(1)).toHaveAttribute("data-delivery", "unknown");
  await expect(rows.nth(1)).toContainText("Delivery not recorded");
  await expect(rows.nth(2)).toHaveAttribute("data-delivery", "unsent");
  await expect(rows.nth(2)).toContainText("Not sent to engineering");

  // The submission is cut off before the server, as in a network failure: the
  // suggestion must be re-sent exactly once, stay in place, and stay re-sendable.
  const resend = page.getByRole("button", { name: "Send suggestion #1 again", exact: true });
  await resend.click();
  await expect.poll(() => attempted.length).toBe(1);
  expect(attempted[0]).toContain("Never reached the server");
  await expect(resend).toBeEnabled();
  await expect(resend).toHaveText("Send again");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toHaveAttribute("data-delivery", "unsent");

  const stored = await page.evaluate(
    (key) =>
      (JSON.parse(localStorage.getItem(key) || "[]") as { id: string; body: string }[]).map(
        (record) => `${record.id}:${record.body}`,
      ),
    INBOX_KEY,
  );
  expect(stored).toEqual([
    "feedback_sent:Delivered idea",
    "feedback_legacy:Older idea with no delivery record",
    "bc_local_1_abc:Never reached the server",
  ]);
});

test("an undelivered suggestion older than the preview can still be re-sent", async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
  const attempted = await blockSuggestSubmissions(page);
  const newer: SeedRecord[] = Array.from({ length: 11 }, (_, index) => ({
    id: `feedback_newer_${index}`,
    body: `Newer idea ${index}`,
    globalNumber: 12 - index,
    delivery: {
      state: "sent" as const,
      issueNumber: 100 + index,
      issueUrl: `https://github.com/example/intake/issues/${100 + index}`,
    },
  }));
  await seedInbox(page, [
    ...newer,
    { id: "bc_local_1_old", body: "Oldest undelivered idea", globalNumber: 1 },
  ]);
  await openDrawer(page);

  const rows = page.getByTestId("beta-feedback-delivery");
  const oldest = page.getByRole("button", { name: "Send suggestion #1 again", exact: true });
  await expect(rows).toHaveCount(10);
  await expect(oldest).toHaveCount(0);

  await page.getByRole("button", { name: "Show all 12", exact: true }).click();
  await expect(rows).toHaveCount(12);
  await oldest.scrollIntoViewIfNeeded();
  await oldest.click();
  await expect.poll(() => attempted.length).toBe(1);
  expect(attempted[0]).toContain("Oldest undelivered idea");

  await page.getByRole("button", { name: "Show fewer", exact: true }).click();
  await expect(rows).toHaveCount(10);
});
