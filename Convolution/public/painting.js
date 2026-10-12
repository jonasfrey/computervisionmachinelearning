/** Paint a round brush along a continuous segment in input-pixel coordinates.
 * The caller owns the mutable buffer. Padding is never part of this buffer.
 * @param {number[]} pixels
 * @param {number} size
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {number} diameter
 * @param {number} value
 */
export function paintSegment(pixels, size, from, to, diameter, value) {
  const radius = diameter / 2;
  const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
  const right = Math.min(size - 1, Math.floor(Math.max(from.x, to.x) + radius));
  const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
  const bottom = Math.min(
    size - 1,
    Math.floor(Math.max(from.y, to.y) + radius),
  );
  const dx = to.x - from.x, dy = to.y - from.y, length = dx * dx + dy * dy;
  let changed = false;
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const t = length === 0 ? 0 : Math.max(
        0,
        Math.min(
          1,
          ((x + 0.5 - from.x) * dx + (y + 0.5 - from.y) * dy) / length,
        ),
      );
      const distance = (x + 0.5 - from.x - t * dx) ** 2 +
        (y + 0.5 - from.y - t * dy) ** 2;
      const index = y * size + x;
      if (distance <= radius ** 2 && pixels[index] !== value) {
        pixels[index] = value;
        changed = true;
      }
    }
  }
  return changed;
}

/** @param {number[]} pixels @param {number} size @param {number} targetSize */
export function resizePainting(pixels, size, targetSize) {
  return Array.from(
    { length: targetSize ** 2 },
    (_, i) =>
      pixels[
        Math.floor(Math.floor(i / targetSize) * size / targetSize) * size +
        Math.floor(i % targetSize * size / targetSize)
      ],
  );
}

/** @param {{size: number, pixels: number[]}} painting */
export function validatePainting(painting) {
  if (
    !painting || !Number.isInteger(painting.size) || painting.size < 3 ||
    painting.size > 512 ||
    !Array.isArray(painting.pixels) ||
    painting.pixels.length !== painting.size ** 2 ||
    painting.pixels.some((v) =>
      typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1
    )
  ) {
    throw new Error("This painting has invalid dimensions or pixel values.");
  }
  return painting;
}
