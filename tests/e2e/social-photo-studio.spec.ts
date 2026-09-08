import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { resetApp, grantTestAccess } from "./helpers";
test("actual photo upload, retained PNG export, and reload recovery", async ({ page }) => {
  await resetApp(page);
  await grantTestAccess(page);
  await page.goto("/marketing");
  const studio = page.getByLabel("Actual-photo image studio");
  await expect(studio.getByRole("button", { name: "Save property for photos" })).toBeVisible();
  await studio.getByLabel("Property title", { exact: true }).fill("Browser acceptance property");
  await studio.getByLabel("Property address", { exact: true }).fill("Agent-supplied test address");
  await studio.getByLabel(/I have permission to market/).check();
  await studio.getByRole("button", { name: "Save property for photos" }).click();
  await expect(studio.getByRole("status")).toContainText("Property saved");
  await studio
    .getByLabel("Actual property photo", { exact: true })
    .setInputFiles(resolve("public/images/rsf-aerial.jpg"));
  await studio.getByRole("button", { name: "Upload actual photo" }).click();
  await expect(studio.getByRole("status")).toContainText("Photo saved", { timeout: 30000 });
  await expect(studio.getByRole("radio")).toBeChecked();
  await studio.getByRole("button", { name: "Export square image", exact: true }).click();
  await expect(
    studio.getByRole("img", { name: "Actual-photo image export", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const image = studio.getByRole("img", { name: "Actual-photo image export", exact: true });
  await expect
    .poll(() =>
      image.evaluate((el) => ({
        width: (el as HTMLImageElement).naturalWidth,
        height: (el as HTMLImageElement).naturalHeight,
      })),
    )
    .toEqual({ width: 1080, height: 1080 });
  const url = await image.getAttribute("src");
  expect(url).toContain("/api/listing-media/");
  const response = await page.request.get(url!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(response.headers()["cache-control"]).toContain("private");
  await page.reload();
  await studio.getByText("Retained image exports", { exact: true }).click();
  await expect(
    studio.getByRole("img", { name: "Retained image: Browser acceptance property" }),
  ).toBeVisible();
  await expect(studio.getByText(/SHA-256:/)).toBeVisible();
  await expect(studio.getByText(/Direct publishing: Planned/)).toBeVisible();
  await studio
    .getByLabel("Property for image export", { exact: true })
    .selectOption({ label: "Browser acceptance property — Agent-supplied test address" });
  page.once("dialog", (dialog) => dialog.accept());
  await studio.getByRole("button", { name: "Delete studio property and photos" }).click();
  await expect(studio.getByRole("status")).toContainText("Property and retained photos deleted");
  expect((await page.request.get(url!)).status()).toBe(404);
});
