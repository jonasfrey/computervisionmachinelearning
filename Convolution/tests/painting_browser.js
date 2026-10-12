import assert from "node:assert/strict";

export async function checkPainting(page, screenshots) {
  const state = () =>
    page.evaluate(() => JSON.parse(JSON.stringify(globalThis.lab)));
  const ready = () =>
    page.waitForFunction(() =>
      !globalThis.lab.pending && !globalThis.lab.uploadBusy &&
      !globalThis.lab.drawing && globalThis.lab.output.length
    );
  const canvas = page.locator(".workspace > .image-panel:first-child canvas");
  const range = async (name, value) =>
    await page.getByLabel(name, { exact: true }).evaluate((input, value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, String(value));
  const location = async (x, y) => {
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox(),
      s = await state(),
      dim = s.size + 2 * s.padding;
    return {
      x: box.x + (x + 0.5 + s.padding) / dim * box.width,
      y: box.y + (y + 0.5 + s.padding) / dim * box.height,
    };
  };
  const dab = async (x, y) => {
    const p = await location(x, y);
    await page.mouse.click(p.x, p.y);
    await ready();
  };
  const line = async (x1, y1, x2, y2) => {
    const from = await location(x1, y1), to = await location(x2, y2);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
    await ready();
  };
  await page.getByLabel("Input size", { exact: true }).selectOption("32");
  await page.getByLabel("START WITH A FILTER", { exact: true }).selectOption(
    "identity",
  );
  await page.getByLabel("Padding", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "New blank", exact: true }).click();
  await ready();
  assert.ok((await state()).pixels.every((v) => v === 0));
  await range("Brush size", 1);
  await line(3, 5, 24, 5);
  let s = await state();
  assert.ok(s.pixels.slice(5 * 32 + 3, 5 * 32 + 25).every((v) => v === 1));
  assert.deepEqual(s.output, s.pixels);
  assert.equal(s.revealed, 1024);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await ready();
  assert.ok((await state()).pixels.every((v) => v === 0));
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await ready();
  assert.deepEqual((await state()).pixels, s.pixels);
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  await dab(10, 5);
  assert.equal((await state()).pixels[5 * 32 + 10], 0);
  assert.equal((await state()).pixels[5 * 32 + 11], 1);
  await page.getByRole("button", { name: "Paint", exact: true }).click();
  await range("Brush size", 3);
  await range("Brush brightness", 128);
  await dab(15, 15);
  s = await state();
  assert.equal(s.pixels[15 * 32 + 15], 128 / 255);
  assert.equal(s.pixels[15 * 32 + 14], 128 / 255);
  assert.equal(s.pixels[15 * 32 + 13], 0);
  const painted = s.pixels;
  await page.getByLabel("Painting name", { exact: true }).fill(
    "Lines & gray dots",
  );
  await page.getByRole("button", { name: "Save painting", exact: true })
    .click();
  await page.getByRole("status").filter({
    hasText: "Saved “Lines & gray dots”",
  }).waitFor();
  assert.equal((await state()).paintings.length, 1);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PNG", exact: true }).click();
  const download = await downloaded;
  await download.saveAs(`${screenshots}/painting.png`);
  const png = await Deno.readFile(`${screenshots}/painting.png`);
  assert.deepEqual(Array.from(png.slice(0, 8)), [
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
  ]);
  const header = new DataView(png.buffer);
  assert.equal(header.getUint32(16), 32);
  assert.equal(header.getUint32(20), 32);
  await page.getByRole("button", { name: "New blank", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await ready();
  assert.deepEqual(
    (await state()).pixels,
    painted,
    "Blank canvas must be undoable",
  );
  await page.getByLabel("Input size", { exact: true }).selectOption("64");
  await ready();
  await page.getByLabel("Input size", { exact: true }).selectOption("32");
  await ready();
  assert.deepEqual(
    (await state()).pixels,
    painted,
    "Resizing a painting must preserve its source",
  );
  await page.screenshot({
    path: `${screenshots}/painting-desktop.png`,
    fullPage: true,
  });

  await page.reload();
  await page.getByText("Server connected", { exact: true }).waitFor();
  await page.evaluate(async () => {
    globalThis.lab = (await import("/convolution/app.js")).store;
  });
  await page.waitForFunction(() => globalThis.lab.paintings.length === 1);
  await page.locator(".painting-library summary").click();
  await page.getByRole("button", {
    name: "Load saved painting Lines & gray dots",
    exact: true,
  }).click();
  await ready();
  s = await state();
  assert.deepEqual(
    s.pixels,
    painted,
    "Stored paintings must survive reload with exact pixels",
  );
  assert.equal(s.size, 32);
  assert.equal(s.paintingName, "Lines & gray dots");
  await page.evaluate(() => {
    globalThis.originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = () => {
      throw new DOMException("Storage unavailable", "SecurityError");
    };
  });
  await page.getByRole("button", { name: "Save painting", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "Could not save" }).waitFor();
  assert.deepEqual((await state()).pixels, painted);
  assert.equal((await state()).paintings.length, 1);
  await page.evaluate(() => {
    indexedDB.open = globalThis.originalOpen;
  });
  await page.getByRole("button", {
    name: "Delete saved painting Lines & gray dots",
    exact: true,
  }).click();
  await page.waitForFunction(() => globalThis.lab.paintings.length === 0);
  assert.deepEqual(
    (await state()).pixels,
    painted,
    "Deleting a saved copy must not erase the current canvas",
  );
  assert.equal(
    await page.evaluate(async () =>
      (await (await import("/convolution/painting-library.js")).listPaintings())
        .length
    ),
    0,
  );

  await page.getByLabel("Input size", { exact: true }).selectOption("8");
  await page.getByLabel("Padding", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "New blank", exact: true }).click();
  await range("Brush size", 1);
  await range("Brush brightness", 255);
  await ready();
  await canvas.hover();
  await page.mouse.wheel(0, -346.57);
  await page.waitForTimeout(50);
  await canvas.click({
    position: {
      x: (await canvas.boundingBox()).width * 0.8,
      y: (await canvas.boundingBox()).height * 0.8,
    },
  });
  await ready();
  s = await state();
  assert.equal(
    s.pixels[5 * 8 + 5],
    1,
    "Zoom and padding must map the brush to input coordinates",
  );
  assert.equal(s.pixels.filter((v) => v > 0).length, 1);
  await page.getByRole("button", { name: "Reset view ↺", exact: true }).click();
  const unchanged = (await state()).pixels;
  await dab(-1, -1);
  assert.deepEqual(
    (await state()).pixels,
    unchanged,
    "Painting padding must not change the input",
  );
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press(" ");
  await ready();
  assert.ok(
    (await state()).pixels.some((v, i) => v !== unchanged[i]),
    "Keyboard painting should paint a pixel",
  );

  await page.getByRole("button", { name: "Load cat photo", exact: true })
    .click();
  await ready();
  await page.getByLabel("Input size", { exact: true }).selectOption("32");
  await ready();
  const catPixels = (await state()).pixels;
  await page.getByRole("button", { name: "Paint", exact: true }).click();
  await dab(0, 0);
  await page.getByRole("button", { name: "↶ Undo", exact: true }).click();
  await ready();
  assert.deepEqual((await state()).pixels, catPixels);
  await page.getByRole("button", { name: "↷ Redo", exact: true }).click();
  await ready();
  await page.getByLabel("Input size", { exact: true }).selectOption("64");
  await ready();
  await page.getByLabel("Input size", { exact: true }).selectOption("32");
  await ready();
  assert.equal(
    (await state()).pixels[0],
    1,
    "Resizing must retain painted changes instead of restoring the original photo",
  );

  await page.getByLabel("Input size", { exact: true }).selectOption("512");
  await page.getByRole("button", { name: "New blank", exact: true }).click();
  await range("Brush size", 33);
  await line(20, 20, 490, 490);
  s = await state();
  assert.equal(s.pixels[256 * 512 + 256], 1);
  assert.equal(s.pixels[0], 0);
  await page.getByLabel("Input size", { exact: true }).selectOption("32");
  await page.getByRole("button", { name: "New blank", exact: true }).click();
  await range("Brush size", 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await ready();
  const p = await location(10, 10), q = await location(20, 20);
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: p.x, y: p.y }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: q.x, y: q.y }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await ready();
  await session.detach();
  assert.equal(
    (await state()).pixels[15 * 32 + 15],
    1,
    "Touch drawing should create continuous strokes",
  );
  assert.ok(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth
    ),
    "Painting controls overflow on mobile",
  );
  await page.screenshot({
    path: `${screenshots}/painting-mobile.png`,
    fullPage: true,
  });
  console.log(
    "PASS: freehand painting, grayscale brush, erase, undo/redo, blank canvas, instant output, local save/load/delete, reload persistence, PNG export, storage failure, zoom/padding, keyboard, edited photo resize, 512px drawing, touch, mobile layout",
  );
}
