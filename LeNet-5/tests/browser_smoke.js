// Keep optional browser tooling out of the app's startup dependencies.
// deno-lint-ignore no-import-prefix
import { chromium } from "npm:playwright-core@1.56.1";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { handler } from "../server.ts";

const server = Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen() {} },
  handler,
);
const baseURL = `http://127.0.0.1:${server.addr.port}`;
const screenshots = await Deno.makeTempDir({ prefix: "lenet-browser-" });
let browser;
try {
  browser = await chromium.launch({
    executablePath: Deno.env.get("CHROME_PATH") || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  assert.equal((await fetch(`${baseURL}/health`)).status, 200);
  assert.equal((await fetch(`${baseURL}/model.ts`)).status, 404);
  assert.equal((await fetch(`${baseURL}/ws`)).status, 426);
  assert.equal((await fetch(`${baseURL}/`, { method: "POST" })).status, 405);
  await page.goto(baseURL);
  await page.getByText("Server connected", { exact: true }).waitFor();
  await page.evaluate(async () => {
    globalThis.lab = (await import("/app.js")).store;
  });
  await page.screenshot({ path: `${screenshots}/initial.png`, fullPage: true });
  const state = () =>
    page.evaluate(async () => {
      const { store } = await import("/app.js");
      return JSON.parse(JSON.stringify(store));
    });
  const waitComplete = () =>
    page.waitForFunction(() => globalThis.lab.current === 7);
  await page.locator(".playback .primary").click();
  await waitComplete();
  let s = await state();
  assert.equal(s.tensors.length, 8);
  assert.ok(Math.abs(s.tensors[7].data.reduce((a, b) => a + b, 0) - 1) < 1e-10);
  const originalScores = s.tensors[7].data;
  await page.locator(".layer-card").nth(1).click();
  await page.waitForFunction(() => globalThis.lab.detail?.layer === "C1");
  s = await state();
  assert.ok(
    Math.abs(s.detail.activation - s.tensors[1].data[s.y * 28 + s.x]) < 1e-10,
  );
  await page.screenshot({ path: `${screenshots}/c1.png`, fullPage: true });
  await page.locator(".detail-map canvas").click({
    position: { x: 60, y: 60 },
  });
  await page.waitForTimeout(100);
  s = await state();
  assert.notEqual(s.x, 14);
  const map = page.locator(".detail-map canvas");
  await map.hover();
  await page.mouse.wheel(0, -200);
  await page.getByRole("button", { name: "Reset view ↺" }).click();
  await page.getByRole("button", { name: "Silence map 0", exact: true })
    .click();
  await page.getByRole("button", { name: "Apply & rerun ↗", exact: true })
    .click();
  await waitComplete();
  s = await state();
  assert.ok(s.tensors[1].data.slice(0, 784).every((v) => v === 0));
  assert.notDeepEqual(s.tensors[7].data, originalScores);
  assert.equal(s.error, "");
  await page.getByRole("button", { name: "Identity", exact: true }).click();
  await page.getByRole("button", { name: "Apply & rerun ↗", exact: true })
    .click();
  await waitComplete();
  s = await state();
  assert.deepEqual(s.tensors[7].data, originalScores);
  await page.getByRole("button", { name: "Reset forward pass", exact: true })
    .click();
  await page.getByRole("button", { name: "↦ Step", exact: true }).click();
  await page.waitForFunction(() => globalThis.lab.current === 0);
  await page.waitForTimeout(500);
  s = await state();
  assert.equal(s.current, 0);
  await page.getByRole("button", { name: "↦ Step", exact: true }).click();
  await page.waitForFunction(() => globalThis.lab.current === 1);
  await page.getByRole("button", { name: "Load sample digit 2", exact: true })
    .click();
  s = await state();
  assert.equal(s.current, -1);
  assert.equal(s.tensors.length, 0);
  await page.getByLabel("Activation callback body").fill("while (true) {}");
  await page.getByLabel("Enable callback", { exact: true }).check();
  await page.getByRole("button", { name: "Apply & rerun ↗", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "exceeded 1 second" })
    .waitFor();
  await page.getByRole("button", { name: "Identity", exact: true }).click();
  await page.getByRole("button", { name: "Apply & rerun ↗", exact: true })
    .click();
  await waitComplete();
  await page.getByLabel("Activation callback body").fill("return NaN;");
  await page.getByLabel("Enable callback", { exact: true }).check();
  await page.getByRole("button", { name: "Apply & rerun ↗", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "finite number" }).waitFor();
  await page.getByRole("button", { name: "Identity", exact: true }).click();
  await page.getByRole("button", { name: "Apply & rerun ↗", exact: true })
    .click();
  await waitComplete();
  await page.locator(".input-tools button").first().click();
  s = await state();
  assert.ok(s.pixels.every((v) => v === 0));
  const drawing = page.getByLabel(
    "Digit drawing canvas. Alternatively choose a sample digit below.",
  );
  await drawing.scrollIntoViewIfNeeded();
  const box = await drawing.boundingBox();
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .7, {
    steps: 10,
  });
  await page.mouse.up();
  s = await state();
  assert.ok(s.pixels.some((v) => v > 0.5));
  // Upload a black-on-white PNG generated in-browser and check preprocessing.
  const upload = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 120;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, 80, 120);
    context.fillStyle = "black";
    context.fillRect(30, 20, 20, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "digit.png",
    mimeType: "image/png",
    buffer: Buffer.from(upload, "base64"),
  });
  await page.waitForFunction(() => globalThis.lab.inputName === "digit.png");
  s = await state();
  assert.ok(s.pixels.some((v) => v > 0.5));
  assert.equal(s.pixels[0], 0);
  await page.getByRole("button", { name: "Load sample digit 7", exact: true })
    .click();
  await page.locator(".playback .primary").click();
  await waitComplete();
  await page.locator(".vector-wrap canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  assert.equal((await state()).channel, 2);
  await page.locator(".layer-card").nth(3).click();
  await page.waitForFunction(() => globalThis.lab.detail?.layer === "C3");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".inspection-heading").scrollIntoViewIfNeeded();
  await page.evaluate(() =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
  );
  await page.screenshot({ path: `${screenshots}/mobile.png`, fullPage: true });
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
    "Mobile layout overflows",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: forward pass, exact inspector, zoom, hook propagation, reproducibility, stepping, input invalidation, timeout, invalid callback, drawing, upload, mobile layout, no browser errors",
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  await server.shutdown();
}
