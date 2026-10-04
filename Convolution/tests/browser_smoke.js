// deno-lint-ignore no-import-prefix
import { chromium } from "npm:playwright-core@1.56.1";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { handler } from "../../LeNet-5/server.ts";

const server = Deno.serve(
  { hostname: "127.0.0.1", port: 0, onListen() {} },
  handler,
);
const baseURL = `http://127.0.0.1:${server.addr.port}`;
const screenshots = await Deno.makeTempDir({ prefix: "convolution-browser-" });
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
  assert.equal(
    (await fetch(`${baseURL}/convolution`)).url,
    `${baseURL}/convolution/`,
  );
  assert.equal((await fetch(`${baseURL}/convolution/server.ts`)).status, 404);
  assert.equal((await fetch(`${baseURL}/convolution/ws`)).status, 426);
  assert.equal(
    (await fetch(`${baseURL}/convolution/`, { method: "POST" })).status,
    405,
  );
  assert.match(
    (await fetch(`${baseURL}/convolution/kernel-worker.js`)).headers.get(
      "content-security-policy",
    ),
    /connect-src 'none'/,
  );
  await page.goto(`${baseURL}/convolution/`);
  await page.getByText("Server connected", { exact: true }).waitFor();
  await page.evaluate(async () => {
    globalThis.lab = (await import("/convolution/app.js")).store;
  });
  const state = () =>
    page.evaluate(() => JSON.parse(JSON.stringify(globalThis.lab)));
  const ready = () =>
    page.waitForFunction(() =>
      !globalThis.lab.pending && !globalThis.lab.hookBusy &&
      globalThis.lab.output.length > 0
    );
  await ready();
  let s = await state();
  assert.equal(s.size, 32);
  assert.equal(s.outputSize, 30);
  assert.equal(s.output.length, 900);
  assert.equal(s.revealed, 0);
  await page.screenshot({ path: `${screenshots}/initial.png`, fullPage: true });

  await page.getByRole("button", { name: "↦ Step", exact: true }).click();
  assert.equal((await state()).cursor, 0);
  await page.getByRole("button", { name: "↦ Step", exact: true }).click();
  assert.equal((await state()).cursor, 1);
  await page.getByRole("button", { name: "▶ Run convolution", exact: true })
    .click();
  await page.waitForFunction(() => globalThis.lab.cursor > 2);
  await page.getByRole("button", { name: "Ⅱ Pause", exact: true }).click();
  const paused = (await state()).cursor;
  await page.waitForTimeout(200);
  assert.equal((await state()).cursor, paused);

  await page.getByRole("button", { name: /Start with a 3 × 3/ }).click();
  await ready();
  assert.deepEqual((await state()).output, [3]);
  await page.getByRole("button", { name: "↦ Step", exact: true }).click();
  assert.equal((await state()).revealed, 1);
  assert.equal(await page.locator(".sum-value strong").textContent(), "3");
  await page.getByLabel("Flip kernel 180° (mathematical convolution)").check();
  await ready();
  assert.deepEqual((await state()).output, [-3]);
  await page.getByLabel("Flip kernel 180° (mathematical convolution)")
    .uncheck();
  await page.getByLabel("Padding", { exact: true }).selectOption("1");
  await ready();
  assert.equal((await state()).outputSize, 3);
  assert.equal(await page.locator(".number-grid .padded").count(), 5);
  await page.getByLabel("Stride", { exact: true }).selectOption("2");
  await ready();
  assert.equal((await state()).outputSize, 2);
  await page.screenshot({ path: `${screenshots}/padding.png`, fullPage: true });

  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByLabel("Input size", { exact: true }).selectOption("8");
  await page.getByLabel("Stride", { exact: true }).selectOption("1");
  await page.getByLabel("Padding", { exact: true }).selectOption("0");
  await ready();
  await page.getByRole("button", { name: "Show result ↗", exact: true })
    .click();
  const output = page.locator(".output-canvas canvas");
  await output.click({ position: { x: 8, y: 8 } });
  await page.keyboard.press("ArrowDown");
  assert.equal((await state()).cursor, 6);
  await output.hover();
  await page.mouse.wheel(0, -200);
  const box = await output.boundingBox();
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 90, { steps: 3 });
  await page.mouse.up();
  assert.equal(
    (await state()).cursor,
    6,
    "Dragging must not select another cell",
  );
  await page.getByRole("button", { name: "Reset view ↺", exact: true }).click();

  const firstWeight = page.getByLabel("Kernel row 1 column 1", { exact: true });
  await firstWeight.fill("2");
  await firstWeight.fill("4");
  await ready();
  s = await state();
  assert.equal(s.resultConfig.kernel[0], 4);
  assert.equal(s.revealed, 0);
  await firstWeight.fill("");
  await page.getByRole("alert").filter({ hasText: "finite numbers" }).waitFor();
  assert.equal((await state()).output.length, 0);
  await firstWeight.fill("0");
  await ready();

  await page.getByLabel("Kernel callback body").fill(
    "return row === 1 && col === 1 ? 1 : 0;",
  );
  await page.getByRole("button", { name: "Apply callback ↗", exact: true })
    .click();
  await ready();
  s = await state();
  assert.deepEqual(s.kernel, [0, 0, 0, 0, 1, 0, 0, 0, 0]);
  assert.equal(s.output[0], s.pixels[9]);
  const original = s.kernel;
  await page.getByLabel("Kernel callback body").fill("return 99;");
  assert.deepEqual(
    (await state()).kernel,
    original,
    "Draft editing must not apply the callback",
  );
  for (
    const [code, message] of [["return NaN;", "finite number"], [
      "return (",
      "Unexpected",
    ], ["while (true) {}", "exceeded 1 second"]]
  ) {
    await page.getByLabel("Kernel callback body").fill(code);
    await page.getByRole("button", { name: "Apply callback ↗", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: message }).waitFor();
    assert.deepEqual(
      (await state()).kernel,
      original,
      "A failed callback must preserve the filter",
    );
  }
  await page.getByRole("button", { name: "Box blur", exact: true }).click();
  await page.getByRole("button", { name: "Apply callback ↗", exact: true })
    .click();
  await ready();
  assert.ok((await state()).kernel.every((v) => v === 1 / 9));

  const upload = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 40, 80);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload input image").setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(upload, "base64"),
  });
  await page.waitForFunction(() => globalThis.lab.inputName === "sample.png");
  await ready();
  s = await state();
  assert.equal(s.pixels[0], 0);
  assert.ok(s.pixels.some((v) => v > 0.99));

  const protocol = await page.evaluate(() =>
    new Promise((resolve) => {
      const socket = new WebSocket(`ws://${location.host}/convolution/ws`);
      const messages = [];
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "hello") {
          socket.send("null");
          return;
        }
        messages.push(message);
        if (messages.length === 1) {
          socket.send(
            JSON.stringify({
              type: "compute",
              requestId: 123,
              config: { ...globalThis.lab.resultConfig, stride: 0 },
            }),
          );
        }
        if (messages.length === 2) {
          socket.send(
            JSON.stringify({
              type: "compute",
              requestId: 124,
              config: globalThis.lab.resultConfig,
            }),
          );
        }
        if (messages.length === 3) {
          socket.close();
          resolve(messages);
        }
      };
    })
  );
  assert.equal(protocol[0].type, "error");
  assert.equal(protocol[1].type, "error");
  assert.equal(protocol[1].requestId, 123);
  assert.equal(protocol[2].type, "result");

  await page.getByLabel("Kernel size", { exact: true }).selectOption("7");
  await ready();
  assert.equal((await state()).kernel.length, 49);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${screenshots}/mobile-large-kernel.png`,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
    "Mobile layout overflows",
  );
  await page.getByLabel("Kernel size", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Shapes", exact: true }).click();
  await page.getByRole("button", { name: "Show result ↗", exact: true })
    .click();
  await page.screenshot({ path: `${screenshots}/mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: numerical display, stepping, playback, padding, stride, flip, editing, callback errors and timeout, zoom/pan, keyboard, upload, protocol validation, mobile layout, no browser errors",
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  await server.shutdown();
}
