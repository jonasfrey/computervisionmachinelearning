# Convolution lab

[← Vision Lab](../README.md) · [Development guide](../docs/development.md)

Follow a filter across an image and inspect how each output pixel is formed. For
installation and startup, see [Run locally](../README.md#run-locally).

## Learn step by step

Choose **Learn step by step** or **Start tutorial** for six hands-on lessons:

1. **Pixels:** select a square and change its brightness; compare 8-bit values
   `[0, 255]` with normalized values `[0, 1]`.
2. **One weight:** multiply a gray pixel by a 1 × 1 kernel and see the resulting
   shade.
3. **Weighted sums:** follow nine products into one output pixel. Compare an
   averaging kernel with all-one weights, and check your prediction.
4. **Sliding and stride:** move one shared filter over an 8 × 8 image and change
   its step size.
5. **Padding:** compare corner and center pixels in an all-white image with zero
   padding.
6. **Photos and code:** experiment with filters and callbacks on a larger cat
   photograph using instant results.

Each lesson loads a reproducible example and introduces the relevant controls.
Use **Previous**, **Next lesson**, or the numbered lesson buttons to navigate.
**Explore freely**, **Exit tutorial**, and **Finish tutorial** keep the current
experiment and show all controls.

## Explore freely

Open `/convolution/` on the same server. The default is a **32 × 32 × 1**
grayscale image and a 3 × 3 vertical-edge filter.

- **Run convolution**, **Pause**, and **Step** move the visible kernel grid
  across the input, one output pixel at a time. Speed ranges from 1 to 60
  cells/second. **Instant convolve** reveals the complete output and enables
  **Instant after edits**. While enabled, changes to the image, settings, kernel
  cells, or an applied callback reveal their new results automatically. Uncheck
  it to return to manual playback after edits; **Reset scan** also lets you step
  through the current result.
- Change **stride**, **zero padding**, or **kernel size** (1, 3, 5, or 7). The
  output dimensions update using `floor((N + 2P - K) / S) + 1`. Invalid
  combinations show an error; changing a setting clears the previous scan.
- Edit each kernel cell directly, choose an edge/blur/sharpen/identity preset,
  or generate the weights with a JavaScript callback. Callbacks are applied once
  to the current kernel, only when **Apply callback** is pressed:

  ```js
  // weight(value, row, col, size): a box blur at any supported kernel size
  return 1 / (size * size);
  ```

  `value` is the current weight; `row` and `col` are zero-based. Results must be
  finite numbers in `[-100, 100]`. A short-lived browser worker terminates after
  one second, and its CSP blocks network access and imported scripts. Errors
  preserve the previous filter. Configuration changes cancel pending callbacks.
  The server receives numeric weights, never executable source.
- Click an output cell or use its arrow keys to inspect the corresponding input
  patch, weights, every product, and sum. Hover or focus a matrix cell to
  highlight the matching multiplication. Padded cells are explicitly marked.
  Click the input to select a nearby window; wheel to zoom and drag to pan
  either image. **Reset view** restores both views.
- **Start with a 3 × 3 example** reduces the calculation to nine products and
  one output cell. Inputs also include shapes, an edge, a checkerboard, a
  gradient, and bundled **cat and coffee photographs**. Photo buttons load at
  256 × 256, or keep a larger selected size. The photos work offline; see their
  [sources and CC0 credits](public/images/README.md).
- Input sizes range from **3 to 512 pixels per side**. Upload a PNG/JPEG/WebP up
  to 10 MB, or choose a bundled photo. Images preserve aspect ratio with black
  margins and convert to grayscale `[0, 1]`. Changing size resamples the
  original photo or upload, preserving detail when you increase the size again.
  Zoom up to 64× to inspect individual pixels in a large image.

The default operation is unflipped cross-correlation, following the CNN
convention documented in
[PyTorch Conv2d](https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html).
Enable **Flip kernel 180°** to compare with mathematical convolution. This tool
has one input channel, one filter, dilation 1, no bias, and no activation.
Output values are raw sums and can be negative or greater than 1. **Output
display** offers two views without changing those numbers:

- **Grayscale image:** clamp to `[0, 1]` for display, then multiply by 255.
  Negative values appear black; values above 1 appear white.
- **Signed colors:** negative responses are blue, positive responses orange, and
  zero is neutral. The full result determines a symmetric color range.

The inspector includes a grayscale swatch and its 8-bit value alongside the raw
sum. Matrix values are shown to four decimals (zoomed canvas labels to three);
arithmetic uses full JavaScript number precision.

The server computes the full output over WebSocket. Playback progressively
reveals it, or instant mode reveals it as soon as it arrives. The browser uses
the same pure numerical module for exact cell inspection. Request IDs discard
outdated responses; reconnecting recomputes the current configuration and
follows the selected playback mode. Expand **Activity** for key client/server
events.
