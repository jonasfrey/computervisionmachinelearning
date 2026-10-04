import assert from "node:assert/strict";
import { convolve, inspect, outputSize, validate } from "../public/math.js";

type Config = Parameters<typeof convolve>[0];
const config = (overrides: Partial<Config> = {}): Config => ({
  size: 3,
  pixels: [0, 0, 0, 0, 1, 1, 0, 1, 1],
  kernelSize: 3,
  kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
  stride: 1,
  padding: 0,
  flip: false,
  ...overrides,
});
const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

Deno.test("worked example exposes all nine products and the unflipped weighted sum", () => {
  const c = config();
  assert.deepEqual(convolve(c), { size: 1, values: [3] });
  const detail = inspect(c, 0);
  assert.deepEqual(detail.terms.map((t) => t.product), [
    -0,
    0,
    0,
    -0,
    0,
    2,
    -0,
    0,
    1,
  ]);
  assert.equal(detail.sum, 3);
  assert.equal(detail.terms.filter((t) => t.padded).length, 0);
  assert.equal(convolve(config({ flip: true })).values[0], -3);
});

Deno.test("mathematical convolution rotates both axes of an asymmetric kernel", () => {
  const c = config({
    pixels: Array.from({ length: 9 }, (_, i) => (i + 1) / 9),
    kernel: Array.from({ length: 9 }, (_, i) => i + 1),
  });
  close(convolve(c).values[0], 285 / 9);
  close(convolve({ ...c, flip: true }).values[0], 165 / 9);
  assert.deepEqual(
    inspect({ ...c, flip: true }, 0).terms.map((t) => t.weight),
    [9, 8, 7, 6, 5, 4, 3, 2, 1],
  );
});

Deno.test("zero padding and stride produce independently known border sums", () => {
  const c = config({
    size: 5,
    pixels: Array(25).fill(1),
    kernel: Array(9).fill(1),
    padding: 1,
    stride: 2,
  });
  assert.deepEqual(convolve(c), {
    size: 3,
    values: [4, 6, 4, 6, 9, 6, 4, 6, 4],
  });
  const corner = inspect(c, 0);
  assert.equal(corner.terms.filter((t) => t.padded).length, 5);
  assert.ok(corner.terms.filter((t) => t.padded).every((t) => t.input === 0));
  assert.equal(inspect(c, 3).x, 0);
  assert.equal(inspect(c, 3).y, 1);
});

Deno.test("stride floors the output size and skips incomplete trailing windows", () => {
  const c = config({
    size: 6,
    pixels: Array.from({ length: 36 }, (_, i) => i / 35),
    kernelSize: 1,
    kernel: [1],
    stride: 4,
  });
  assert.equal(outputSize(c), 2);
  assert.deepEqual(convolve(c).values, [0, 4 / 35, 24 / 35, 28 / 35]);
});

Deno.test("identity preserves the input with padding and blur does not renormalize borders", () => {
  const pixels = Array.from({ length: 1024 }, (_, i) => (i % 17) / 16);
  const c = config({
    size: 32,
    pixels,
    kernel: [0, 0, 0, 0, 1, 0, 0, 0, 0],
    padding: 1,
  });
  assert.deepEqual(convolve(c).values, pixels);
  const blurred = convolve(
    config({
      pixels: Array(9).fill(1),
      kernel: Array(9).fill(1 / 9),
      padding: 1,
    }),
  );
  close(blurred.values[0], 4 / 9);
  close(blurred.values[4], 1);
});

Deno.test("inspection agrees with every result for varied strides, padding, kernels and flips", () => {
  for (const kernelSize of [1, 3, 5, 7]) {
    for (const stride of [1, 2, 3, 4]) {
      for (const padding of [0, 1, 2, 3]) {
        for (const flip of [false, true]) {
          const c = config({
            size: 8,
            pixels: Array.from({ length: 64 }, (_, i) => (i % 13) / 12),
            kernelSize,
            kernel: Array.from(
              { length: kernelSize ** 2 },
              (_, i) => i % 5 - 2,
            ),
            stride,
            padding,
            flip,
          });
          const result = convolve(c);
          result.values.forEach((value, i) => {
            const detail = inspect(c, i);
            close(
              value,
              detail.terms.reduce((sum, t) => sum + t.input * t.weight, 0),
            );
          });
        }
      }
    }
  }
});

Deno.test("invalid dimensions, pixel values, kernels and coordinates are rejected", () => {
  for (
    const patch of [
      { size: 0 },
      { size: 65 },
      { size: 3.5 },
      { pixels: [] },
      { kernelSize: 2 },
      { kernelSize: 9 },
      { kernel: [] },
      { stride: 0 },
      { stride: 1.5 },
      { stride: 5 },
      { padding: -1 },
      { padding: 4 },
      { padding: 0.5 },
      { kernelSize: 7, kernel: Array(49).fill(1) },
    ]
  ) assert.throws(() => convolve(config(patch)));
  for (const value of [NaN, Infinity, -1, 2, "1", null]) {
    assert.throws(() =>
      validate(config({ pixels: [value, ...Array(8).fill(0)] as number[] }))
    );
  }
  for (const value of [NaN, Infinity, -101, 101, "1", null]) {
    assert.throws(() =>
      validate(config({ kernel: [value, ...Array(8).fill(0)] as number[] }))
    );
  }
  for (const invalid of [null, [], {}, { ...config(), flip: "false" }]) {
    assert.throws(() => validate(invalid as Config));
  }
  for (const index of [-1, 1, 0.5, NaN]) {
    assert.throws(() => inspect(config(), index));
  }
});
