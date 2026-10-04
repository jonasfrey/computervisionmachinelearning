/**
 * Shared numerical implementation for server computation and browser inspection.
 * @typedef {{size: number, pixels: number[], kernelSize: number, kernel: number[], stride: number, padding: number, flip: boolean}} Configuration
 */

/** @param {Configuration} config */
export function outputSize(config) {
  return Math.floor(
    (config.size + 2 * config.padding - config.kernelSize) / config.stride,
  ) + 1;
}

/** @param {Configuration} config */
export function validate(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Expected a convolution configuration.");
  }
  for (
    const [name, value, min, max] of [
      ["Input size", config.size, 3, 64],
      ["Kernel size", config.kernelSize, 1, 7],
      ["Stride", config.stride, 1, 4],
      ["Padding", config.padding, 0, 3],
    ]
  ) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    }
  }
  if (config.kernelSize % 2 !== 1) {
    throw new Error("Choose an odd kernel size: 1, 3, 5, or 7.");
  }
  if (typeof config.flip !== "boolean") {
    throw new Error("Kernel flip must be a boolean.");
  }
  if (
    !Array.isArray(config.pixels) ||
    config.pixels.length !== config.size ** 2 ||
    config.pixels.some((v) =>
      typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1
    )
  ) {
    throw new Error(
      "Input pixels must be finite numbers in [0, 1], matching the input size.",
    );
  }
  if (
    !Array.isArray(config.kernel) ||
    config.kernel.length !== config.kernelSize ** 2 ||
    config.kernel.some((v) =>
      typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 100
    )
  ) {
    throw new Error(
      "Kernel cells must be finite numbers between −100 and 100.",
    );
  }
  if (outputSize(config) < 1) {
    throw new Error(
      "The kernel does not fit. Add padding or choose a smaller kernel.",
    );
  }
  return config;
}

/** A single output cell, in row-major order; coordinates refer to the unpadded input.
 * @param {Configuration} config
 * @param {number} index
 */
export function inspect(config, index) {
  const width = outputSize(config);
  if (!Number.isInteger(index) || index < 0 || index >= width ** 2) {
    throw new Error("Output cell is outside the result.");
  }
  const x = index % width, y = Math.floor(index / width);
  const terms = [];
  let sum = 0;
  for (let row = 0; row < config.kernelSize; row++) {
    for (let col = 0; col < config.kernelSize; col++) {
      const inputX = x * config.stride + col - config.padding;
      const inputY = y * config.stride + row - config.padding;
      const padded = inputX < 0 || inputY < 0 || inputX >= config.size ||
        inputY >= config.size;
      const input = padded ? 0 : config.pixels[inputY * config.size + inputX];
      const kernelIndex = row * config.kernelSize + col;
      const weight = config.kernel[
        config.flip ? config.kernel.length - 1 - kernelIndex : kernelIndex
      ];
      const product = input * weight;
      sum += product;
      terms.push({ inputX, inputY, input, weight, product, padded });
    }
  }
  return { x, y, terms, sum };
}

/** @param {Configuration} config */
export function convolve(config) {
  validate(config);
  const size = outputSize(config);
  const values = Array.from(
    { length: size ** 2 },
    (_, i) => inspect(config, i).sum,
  );
  return { size, values };
}
