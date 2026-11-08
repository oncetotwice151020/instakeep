import { chromium } from "../outputs/qa/node_modules/playwright-core/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const base = process.env.QA_BASE_URL || "http://127.0.0.1:5173";
await fs.mkdir("outputs/qa-results", { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.screenshot({ path: "outputs/qa-results/desktop.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.getByRole("button", { name: "解析链接", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "请先粘贴" }).waitFor();
  await page.getByLabel("粘贴你的 Instagram 链接", { exact: true }).fill("https://www.instagram.com/p/Abc123_/");
  await page.getByRole("button", { name: "解析链接", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "确认你有权" }).waitFor();
  await page.getByRole("button", { name: "体验示例" }).click();
  assert.equal(await page.locator(".media-card").count(), 3);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载第 1 个文件", exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), "instakeep_mountains.svg");
  await download.saveAs("outputs/qa-results/downloaded-mountains.svg");
  assert.ok((await fs.stat("outputs/qa-results/downloaded-mountains.svg")).size > 1000);
  await page.getByRole("tab", { name: "视频 / Reels", exact: true }).click();
  await page.getByText("此结果中没有视频。").waitFor();
  await page.getByRole("button", { name: "查看全部内容" }).click();
  await page.screenshot({ path: "outputs/qa-results/results.png", fullPage: true });
  await page.getByRole("button", { name: "最近记录" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page.locator(".faq-list summary").first().click();
  assert.equal(await page.locator(".faq-list details").first().getAttribute("open"), "");

  const bad = await context.request.post(`${base}/api/resolve`, { data: { url: "https://127.0.0.1/private", authorized: true } });
  assert.equal(bad.status(), 400);
  const unauthorized = await context.request.post(`${base}/api/resolve`, { data: { url: "https://www.instagram.com/p/Abc123_/" } });
  assert.equal(unauthorized.status(), 400);
  const hostile = await context.request.post(`${base}/api/resolve`, { headers: { Origin: "https://evil.example" }, data: { url: "https://www.instagram.com/p/Abc123_/", authorized: true } });
  assert.equal(hostile.status(), 403);
  const badMedia = await context.request.get(`${base}/api/media?post=https://127.0.0.1/private&index=0`);
  assert.equal(badMedia.status(), 400);
  const live = await context.request.post(`${base}/api/resolve`, { data: { url: "https://www.instagram.com/reel/Chunk8-jurw/", authorized: true }, timeout: 45000 });
  const liveResult = { status: live.status(), body: await live.json() };
  if (live.ok()) {
    const mediaPath = `${base}/api/media?post=${encodeURIComponent(liveResult.body.url)}&index=0`;
    const bytes = await context.request.get(mediaPath, { headers: { Range: "bytes=0-1023" }, timeout: 45000 });
    assert.equal(bytes.status(), 206);
    assert.equal(bytes.headers()["content-type"], "video/mp4");
    assert.equal((await bytes.body()).length, 1024);
    liveResult.rangeTransfer = { status: bytes.status(), bytes: 1024, contentType: bytes.headers()["content-type"] };
  }
  console.log("LIVE_INSTAGRAM", JSON.stringify(liveResult));

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base, { waitUntil: "networkidle" });
  assert.equal(await mobile.evaluate(() => window.innerWidth), 390);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await mobile.screenshot({ path: "outputs/qa-results/mobile.png", fullPage: true });
  await mobile.getByRole("button", { name: "体验示例" }).click();
  assert.equal(await mobile.locator(".media-card").count(), 3);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(errors, []);
  await fs.writeFile("outputs/qa-results/report.json", JSON.stringify({ checks: ["desktop layout", "mobile layout", "empty input", "consent", "demo previews", "actual demo file download", "type filtering", "history modal", "FAQ", "invalid-host rejection", "authorization rejection", "cross-origin rejection", "media proxy rejection", "no page errors"], liveInstagram: liveResult }, null, 2));
  console.log("Browser QA passed: desktop, mobile, preview, download, filters, history, FAQ and API checks.");
} finally { await browser.close(); }
