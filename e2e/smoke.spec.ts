import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

async function waitForMyTurn(page: Page): Promise<"turn" | "dialog" | "timeout"> {
  for (let i = 0; i < 120; i++) {
    if (await page.locator("dialog[open]").count()) return "dialog";
    const status = (await page.getByRole("status").first().textContent()) ?? "";
    if (/Your turn|No playable|drew a playable|Stack a draw|Nothing to play/.test(status)) return "turn";
    await page.waitForTimeout(250);
  }
  return "timeout";
}

test("lobby renders and explains the rules", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("UNO");
  await expect(page.getByRole("button", { name: "Deal me in" })).toBeVisible();
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.locator("dialog[open]")).toContainText("Wild Draw Four");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("a game can be played against the AI", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("radio", { name: "1 round" }).click();
  await page.getByRole("button", { name: "Deal me in" }).click();

  await expect(page.getByRole("group", { name: /Your hand/ })).toBeVisible();
  await expect(page.locator("button[data-card]")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: /Draw pile/ })).toBeVisible();

  let moves = 0;
  for (let turn = 0; turn < 12; turn++) {
    const state = await waitForMyTurn(page);
    if (state === "timeout") break;
    if (state === "dialog") {
      const dialog = page.locator("dialog[open]");
      const title = (await dialog.locator("h2").first().textContent()) ?? "";
      if (/color/i.test(title)) await dialog.getByRole("button", { name: /Red/ }).click();
      else if (/Challenge/i.test(title)) await dialog.getByRole("button", { name: "Draw 4" }).click();
      else break; // round over
      moves++;
      continue;
    }
    const status = (await page.getByRole("status").first().textContent()) ?? "";
    const playable = page.locator("button[data-card][aria-disabled=false]");
    if (/drew a playable/.test(status)) {
      await page.getByRole("button", { name: "Play it" }).click();
    } else if (await playable.count()) {
      if ((await page.locator("button[data-card]").count()) === 2) await page.getByRole("button", { name: /Call UNO/ }).click();
      await playable.first().click();
      const picker = page.locator("dialog[open]");
      if (await picker.count()) await picker.getByRole("button", { name: /Blue/ }).click();
    } else {
      await page.getByRole("button", { name: /^(Draw|Pass|Take \+\d+)$/ }).first().click();
    }
    moves++;
    await page.waitForTimeout(600);
  }
  expect(moves).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test("settings persist across reloads", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  const toggle = page.getByRole("switch", { name: /Color-blind symbols/ });
  await expect(toggle).not.toBeChecked();
  await page.getByText("Color-blind symbols").click();
  await expect(toggle).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("switch", { name: /Color-blind symbols/ })).toBeChecked();
});

test("quitting from the pause menu and starting again keeps the AI playing", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Deal me in" }).click();
  await expect(page.getByRole("group", { name: /Your hand/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toContainText("Paused");
  await page.getByRole("button", { name: /quit to menu/ }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await page.getByRole("button", { name: "Deal me in" }).click();

  // Keep moving until the AI takes a turn (a Skip would give us another go).
  let aiMoved = false;
  for (let i = 0; i < 6 && !aiMoved; i++) {
    if ((await waitForMyTurn(page)) === "timeout") break;
    const dialog = page.locator("dialog[open]");
    if (await dialog.count()) {
      await dialog.getByRole("button").first().click();
    } else {
      const playable = page.locator("button[data-card][aria-disabled=false]");
      if (await playable.count()) {
        await playable.first().click();
        const picker = page.locator("dialog[open]");
        if (await picker.count()) await picker.getByRole("button", { name: /Green/ }).click();
      } else {
        await page.getByRole("button", { name: /^(Draw|Pass|Take \+\d+)$/ }).first().click();
      }
    }
    aiMoved = await page
      .getByRole("status")
      .first()
      .filter({ hasText: /thinking|deciding|turn$/ })
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);
  }
  expect(aiMoved).toBe(true);
  expect(await waitForMyTurn(page)).not.toBe("timeout");
  expect(errors).toEqual([]);
});
