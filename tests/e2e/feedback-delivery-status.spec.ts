import { expect, test } from "@playwright/test";
import { grantTestAccess, resetApp } from "./helpers";

const INBOX_KEY = "realestate-ai-beta-inbox";

test("Suggest history shows delivery status and re-sends without duplicating", async ({
  page,
}) => {
  await resetApp(page);
  await grantTestAccess(page);
  await page.evaluate((key) => {
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
      JSON.stringify([
        {
          ...base,
          id: "feedback_sent",
          body: "Delivered idea",
          globalNumber: 3,
          fileName: "0003-calendar.md",
          delivery: {
            state: "sent",
            issueNumber: 41,
            issueUrl: "https://github.com/example/intake/issues/41",
          },
        },
        // Saved before delivery tracking existed: accepted by the server, issue unknown.
        {
          ...base,
          id: "feedback_legacy",
          body: "Older idea with no delivery record",
          globalNumber: 2,
          fileName: "0002-calendar.md",
        },
        // Provisional device id: the server never accepted it.
        {
          ...base,
          id: "bc_local_1_abc",
          body: "Never reached the server",
          globalNumber: 1,
          fileName: "0001-calendar.md",
        },
      ]),
    );
  }, INBOX_KEY);
  await page.reload();

  await page.getByRole("button", { name: "Open beta feedback drawer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta Feedback" })).toBeVisible();

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

  // The test server has no intake token, so a re-send cannot create an issue.
  // The suggestion must stay in place, stay re-sendable, and never duplicate.
  const resend = page.getByRole("button", { name: "Send suggestion #1 again", exact: true });
  await resend.click();
  await expect(resend).toBeEnabled();
  await expect(resend).toHaveText("Send again");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toHaveAttribute("data-delivery", "unsent");

  const stored = await page.evaluate(
    (key) =>
      (JSON.parse(localStorage.getItem(key) || "[]") as { body: string }[]).map(
        (record) => record.body,
      ),
    INBOX_KEY,
  );
  expect(stored).toEqual([
    "Delivered idea",
    "Older idea with no delivery record",
    "Never reached the server",
  ]);
});
