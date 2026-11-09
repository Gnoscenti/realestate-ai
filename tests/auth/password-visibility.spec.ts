import { expect, test, type Page } from "@playwright/test";

const SECRET = "Correct-Horse-Battery-9";

async function openLogin(page: Page, mode: "Sign in" | "Create account") {
  await page.goto("/login");
  await page.getByRole("button", { name: mode, exact: true }).click();
  return page.locator("#login-password");
}

for (const mode of ["Sign in", "Create account"] as const) {
  test(`${mode}: eye toggle reveals and re-masks the password without submitting`, async ({ page }) => {
    const authRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/api/auth/") && request.method() === "POST") {
        authRequests.push(request.url());
      }
    });

    const password = await openLogin(page, mode);
    await password.fill(SECRET);
    await expect(password).toHaveAttribute("type", "password");
    // Shown secrets must not be sent to cloud spell-check services.
    await expect(password).toHaveAttribute("spellcheck", "false");

    await page.getByRole("button", { name: "Show password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue(SECRET);

    await page.getByRole("button", { name: "Hide password", exact: true }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue(SECRET);

    await expect(page).toHaveURL(/\/login/);
    expect(authRequests, "The eye toggle must never submit the form").toEqual([]);
  });
}

test("eye toggle works from the keyboard and keeps typing in place", async ({ page }) => {
  const password = await openLogin(page, "Sign in");
  await password.click();
  await page.keyboard.type("abc");

  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", { name: "Show password", exact: true });
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "Hide password", exact: true })).toBeFocused();

  // Clicking the eye while typing keeps focus in the field.
  await password.click();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(password).toBeFocused();
  await page.keyboard.type("def");
  await expect(password).toHaveValue("abcdef");
});

test("typing straight after the eye click lands at the caret, before any animation frame", async ({ page }) => {
  const password = await openLogin(page, "Sign in");
  await password.click();
  await page.keyboard.type("abcdef");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");

  // A busy device can take a long time to render the next frame. The caret must
  // already be back in place when the click returns, so hold every frame callback.
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });

  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await page.keyboard.type("X");
  await expect(password).toHaveValue("abcdXef");

  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await page.keyboard.type("Y");
  await expect(password).toHaveValue("abcdXYef");
});

test("revealed password is masked again when the form submits", async ({ page }) => {
  const password = await openLogin(page, "Sign in");
  await page.locator("#login-email").fill("nobody-here@example.test");
  await password.fill(SECRET);
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");

  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/auth/sign-in/email",
  );
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await response;

  await expect(password).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: "Show password", exact: true })).toBeVisible();
});
