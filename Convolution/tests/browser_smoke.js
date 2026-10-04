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
      !globalThis.lab.uploadBusy &&
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
  await page.getByRole("button", { name: "ϟ Instant convolve", exact: true })
    .click();
  assert.equal((await state()).instant, true);
  assert.equal((await state()).revealed, 36);
  await page.getByLabel("Instant after edits", { exact: true }).uncheck();
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
  await page.getByRole("button", { name: "ϟ Instant convolve", exact: true })
    .click();
  await page.screenshot({ path: `${screenshots}/mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByLabel("START WITH A FILTER", { exact: true }).selectOption(
    "identity",
  );
  await page.getByLabel("Padding", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Load cat photo", exact: true })
    .click();
  await ready();
  s = await state();
  assert.equal(s.sample, "cat");
  assert.equal(s.size, 256);
  assert.equal(s.revealed, 256 ** 2);
  assert.equal(s.displayMode, "grayscale");
  assert.deepEqual(s.output, s.pixels);
  await page.getByLabel("Input size", { exact: true }).selectOption("512");
  await ready();
  s = await state();
  assert.equal(s.size, 512);
  assert.equal(s.revealed, 512 ** 2);
  assert.deepEqual(s.output, s.pixels);
  const photoPixels = s.pixels;
  await page.getByLabel("Output display", { exact: true }).selectOption(
    "signed",
  );
  assert.deepEqual(
    (await state()).output,
    photoPixels,
    "Display mode must not alter raw data",
  );
  await page.getByLabel("Output display", { exact: true }).selectOption(
    "grayscale",
  );
  await page.getByLabel("Input size", { exact: true }).selectOption("32");
  await ready();
  await page.getByLabel("Input size", { exact: true }).selectOption("512");
  await ready();
  assert.deepEqual(
    (await state()).pixels,
    photoPixels,
    "Resizing must return to the original photo, not upscale the tiny preview",
  );
  await page.getByLabel("Kernel row 2 column 2", { exact: true }).fill("2");
  await ready();
  s = await state();
  assert.equal(
    s.revealed,
    s.output.length,
    "Instant mode must reveal edited results",
  );
  assert.equal(s.output[128 * 512 + 128], 2 * s.pixels[128 * 512 + 128]);
  await page.getByLabel("Kernel callback body").fill(
    "return row === 1 && col === 1 ? 1 : 0;",
  );
  await page.getByRole("button", { name: "Apply callback ↗", exact: true })
    .click();
  await ready();
  s = await state();
  assert.deepEqual(s.output, photoPixels);
  assert.equal(
    s.revealed,
    s.output.length,
    "Instant mode must apply to callbacks",
  );
  await page.screenshot({
    path: `${screenshots}/photo-512.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Load coffee photo", exact: true })
    .click();
  await ready();
  s = await state();
  assert.equal(s.sample, "coffee");
  assert.notDeepEqual(s.pixels, photoPixels);
  await page.getByLabel("Instant after edits", { exact: true }).uncheck();
  await page.getByLabel("Kernel row 2 column 2", { exact: true }).fill("0");
  await ready();
  assert.equal(
    (await state()).revealed,
    0,
    "Animation mode should wait for playback after edits",
  );

  await page.getByRole("button", { name: "Learn step by step", exact: true })
    .click();
  await ready();
  assert.equal((await state()).lesson, 0);
  assert.equal(await page.locator(".workspace").count(), 0);
  await page.getByLabel("Selected pixel brightness", { exact: true }).focus();
  await page.keyboard.press("End");
  assert.equal((await state()).pixels[4], 1);
  await page.getByRole("button", { name: "Black", exact: true }).click();
  assert.equal((await state()).pixels[4], 0);
  await page.screenshot({
    path: `${screenshots}/tutorial-pixels.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
  );
  await page.screenshot({
    path: `${screenshots}/tutorial-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  const nextLesson = async () => {
    await page.getByRole("button", { name: "Next lesson →", exact: true })
      .click();
    await ready();
  };
  await nextLesson();
  s = await state();
  assert.equal(s.kernelSize, 1);
  assert.equal(s.output[0], 0.5);
  await page.getByLabel("Kernel row 1 column 1", { exact: true }).fill("2");
  await ready();
  await page.getByRole("button", { name: "↦ Step", exact: true }).click();
  assert.equal(await page.locator(".sum-value strong").textContent(), "1");
  assert.match(await page.locator(".output-pixel").textContent(), /255 \/ 255/);
  await nextLesson();
  assert.ok(Math.abs((await state()).output[0] - 4 / 9) < 1e-10);
  await page.getByRole("button", { name: "4/9", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Exactly" }).waitFor();
  await page.getByRole("button", { name: "Try all weights = 1", exact: true })
    .click();
  await ready();
  assert.equal((await state()).output[0], 4);
  await page.getByRole("button", { name: "↦ Step", exact: true }).click();
  assert.match(await page.locator(".output-pixel").textContent(), /255 \/ 255/);
  const displayedPixel = await page.locator(".output-canvas canvas").evaluate(
    (canvas) =>
      Array.from(canvas.getContext("2d").getImageData(10, 10, 1, 1).data),
  );
  assert.deepEqual(
    displayedPixel,
    [255, 255, 255, 255],
    "An output of 4 displays white in grayscale",
  );
  await page.getByRole("button", { name: "Restore the average", exact: true })
    .click();
  await ready();
  assert.match(await page.locator(".output-pixel").textContent(), /113 \/ 255/);
  await page.screenshot({
    path: `${screenshots}/tutorial-sum.png`,
    fullPage: true,
  });
  await nextLesson();
  assert.equal((await state()).outputSize, 6);
  assert.equal(await page.getByLabel("Padding", { exact: true }).count(), 0);
  await page.getByLabel("Stride", { exact: true }).selectOption("2");
  await ready();
  assert.equal((await state()).outputSize, 3);
  await nextLesson();
  s = await state();
  assert.equal(s.padding, 1);
  assert.ok(Math.abs(s.output[0] - 4 / 9) < 1e-10);
  assert.ok(Math.abs(s.output[4] - 1) < 1e-10);
  await nextLesson();
  s = await state();
  assert.equal(s.lesson, 5);
  assert.equal(s.sample, "cat");
  assert.equal(s.size, 256);
  assert.equal(s.instant, true);
  assert.equal(s.revealed, s.output.length);
  await page.getByRole("button", { name: "← Previous", exact: true }).click();
  await ready();
  assert.equal((await state()).lesson, 4);
  await nextLesson();
  await page.getByRole("button", { name: "Finish tutorial", exact: true })
    .click();
  assert.equal((await state()).lesson, -1);
  assert.equal((await state()).sample, "cat");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: six tutorial lessons, 512px photos, source-preserving resize, instant callbacks, grayscale display, numerical display, stepping, playback, padding, stride, flip, editing, callback errors and timeout, zoom/pan, keyboard, upload, protocol validation, mobile layout, no browser errors",
  );
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  await server.shutdown();
}
