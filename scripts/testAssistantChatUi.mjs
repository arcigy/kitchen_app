import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.KITCHEN_UI_BASE_URL ?? "http://127.0.0.1:5180/";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const turns = [];
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.route("**/api/assistant/turn", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    turns.push(body);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        phase: "answer",
        assistantMessage: "## Hotovo\n\nCena označených položiek je **420,50 €**.",
        toolCalls: [],
        requiresConfirmation: false,
        workflow: null,
        plan: null
      })
    });
  });

  try {
    await installAuthSession(page);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#arcigy-chatbot-launcher", { timeout: 30000 });
    await page.locator("#arcigy-chatbot-launcher").click();
    const panel = page.locator(".chatbot-panel");
    await panel.waitFor({ state: "visible" });
    const textarea = panel.locator("textarea");
    await textarea.fill("Koľko stoja označené moduly?");
    const firstRequest = page.waitForRequest((request) => request.url().includes("/api/assistant/turn"), { timeout: 30000 });
    await textarea.press("Enter");
    await firstRequest;
    await panel.locator(".chatbot-message.assistant").waitFor({ timeout: 30000 });
    assert((await panel.textContent())?.includes("Cena označených položiek je"), `Assistant response was not rendered: ${await panel.textContent()}`);
    assert((await panel.locator("pre").count()) === 0, "Assistant chat rendered a raw JSON/code block.");
    assert(await panel.locator("strong").filter({ hasText: "420,50 €" }).count() > 0, "Assistant Markdown was not rendered.");

    await panel.locator("[data-chatbot-new-thread]").click();
    await textarea.fill("Zapamätaj si, že klient chce biely korpus.");
    await textarea.press("Enter");
    await panel.locator(".chatbot-message.assistant").waitFor({ timeout: 30000 });
    await textarea.fill("Čo som ti práve povedal o korpuse?");
    await textarea.press("Enter");
    await page.waitForFunction(() => document.querySelectorAll(".chatbot-message.assistant").length >= 2);

    assert(turns.length === 3, `Expected three assistant turns, got ${turns.length}.`);
    assert(Array.isArray(turns[2].conversation) && turns[2].conversation.some((item) => item.content?.includes("biely korpus")), "The current chat history was not sent with the follow-up message.");
    assert((await panel.locator("[data-chatbot-thread]").count()) >= 2, "Chat switching UI did not preserve two chats.");
    assert(consoleErrors.length === 0, `Assistant chat produced console errors: ${consoleErrors.join(" | ")}`);
    console.log(JSON.stringify({ ok: true, baseUrl, turns: turns.length, checks: ["enter-send", "markdown", "no-raw-json", "thread-switching", "conversation-memory", "console"] }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
