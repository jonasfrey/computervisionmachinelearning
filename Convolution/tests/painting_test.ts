import assert from "node:assert/strict";
import {
  paintSegment,
  resizePainting,
  validatePainting,
} from "../public/painting.js";

Deno.test("freehand segments have no gaps when pointer events skip pixels", () => {
  const pixels = Array(32 ** 2).fill(0);
  assert.equal(
    paintSegment(pixels, 32, { x: 2.5, y: 5.5 }, { x: 27.5, y: 5.5 }, 1, 1),
    true,
  );
  assert.deepEqual(pixels.slice(5 * 32 + 2, 5 * 32 + 28), Array(26).fill(1));
  assert.equal(pixels.filter((v) => v === 1).length, 26);
  paintSegment(pixels, 32, { x: 2.5, y: 2.5 }, { x: 27.5, y: 27.5 }, 1, 0.5);
  for (let i = 2; i <= 27; i++) assert.equal(pixels[i * 32 + i], 0.5);
});

Deno.test("round brushes, grayscale and erasing affect only the selected footprint", () => {
  const pixels = Array(9 ** 2).fill(0);
  paintSegment(pixels, 9, { x: 4.5, y: 4.5 }, { x: 4.5, y: 4.5 }, 3, 128 / 255);
  assert.equal(pixels.filter((v) => v === 128 / 255).length, 9);
  assert.equal(pixels[4 * 9 + 2], 0);
  paintSegment(pixels, 9, { x: 4.5, y: 4.5 }, { x: 4.5, y: 4.5 }, 1, 0);
  assert.equal(pixels[4 * 9 + 4], 0);
  assert.equal(pixels[4 * 9 + 5], 128 / 255);
});

Deno.test("painting clips to real input pixels and ignores a dab in padding", () => {
  const pixels = Array(8 ** 2).fill(0);
  assert.equal(
    paintSegment(pixels, 8, { x: -0.5, y: -0.5 }, { x: -0.5, y: -0.5 }, 1, 1),
    false,
  );
  paintSegment(pixels, 8, { x: -10.5, y: 3.5 }, { x: 20.5, y: 3.5 }, 1, 1);
  assert.equal(pixels.length, 64);
  assert.equal(pixels.filter((v) => v === 1).length, 8);
  assert.ok(pixels.slice(24, 32).every((v) => v === 1));
});

Deno.test("painting resize preserves the source and exact stored pixel values", () => {
  const pixels = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 1];
  const bigger = resizePainting(pixels, 3, 6);
  assert.deepEqual(resizePainting(bigger, 6, 3), pixels);
  assert.equal(bigger[2 * 6 + 2], 0.4);
  assert.equal(validatePainting({ size: 3, pixels }).pixels, pixels);
  assert.throws(() => validatePainting({ size: 513, pixels }));
  assert.throws(() =>
    validatePainting({ size: 3, pixels: [NaN, ...pixels.slice(1)] })
  );
  assert.throws(() =>
    validatePainting({ size: 3, pixels: [1.1, ...pixels.slice(1)] })
  );
  assert.throws(() => validatePainting({ size: 3, pixels: [] }));
});
