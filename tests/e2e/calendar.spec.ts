import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resetApp, grantTestAccess } from "./helpers";

// This is also the cold-start regression: a successful warm-cache retry must
// never hide a dependency-optimizer reload that destroys an unsaved form.
test.describe.configure({ retries: 0 });
test("manual appointment validates, persists, exports and completes without demo sync", async ({page}, testInfo) => {
  const reloads: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      try {
        const message: { type?: string; path?: string } = JSON.parse(payload.toString());
        if (message.type === "full-reload") reloads.push(message.path ?? "*");
      } catch {
        // Non-JSON frames are not Vite reload messages.
      }
    });
  });
  await resetApp(page); await grantTestAccess(page); await page.goto("/calendar");
  await expect(page.getByRole("button",{name:"Sync calendars"})).toHaveCount(0);
  await expect(page.getByTestId("entitled-workspace")).toHaveCSS("display", "flex");
  const documentStartedAt = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole("button",{name:"Add appointment",exact:true}).click();
  await page.getByLabel("Title",{exact:true}).fill("Rural inspection preparation");
  await page.getByLabel("Starts",{exact:true}).fill("2027-03-10T10:00");
  await page.getByLabel("Ends",{exact:true}).fill("2027-03-10T09:00");
  await page.getByRole("button",{name:"Save appointment",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("End time must be after");
  await page.getByLabel("Ends",{exact:true}).fill("2027-03-10T11:00");
  await page.getByRole("textbox",{name:"Preparation notes",exact:true}).fill("Bring the property disclosure documents.");
  await page.getByRole("button",{name:"Save appointment",exact:true}).click();
  await expect(page.getByText("Rural inspection preparation",{exact:true})).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin), "Editing must stay in the same document").toBe(documentStartedAt);
  expect(reloads, "Vite must not reload the page while discovering dependencies").toEqual([]);
  await page.reload();
  await expect(page.getByText("Rural inspection preparation",{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("calendar-desktop.png"),fullPage:true});
  const downloadReady=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export calendar",exact:true}).click();
  const download=await downloadReady;
  expect(download.suggestedFilename()).toBe("appointment.ics");
  expect(await readFile((await download.path())!,"utf8")).toContain("SUMMARY:Rural inspection preparation");
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole("button",{name:"Export calendar",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("calendar-mobile.png"),fullPage:true});
  await page.getByRole("button",{name:"Done",exact:true}).click();
  await expect(page.getByText("completed",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Delete Rural inspection preparation",exact:true}).click();
  await expect(page.getByText("Your calendar is clear",{exact:true})).toBeVisible();
  expect(reloads, "Calendar navigation must not trigger an optimizer reload").toEqual([]);
});
