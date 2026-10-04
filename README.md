# Vision Lab — LeNet-5 & Convolution

Two interactive tools based on `hgc/hgc_readme.md`, `hgc/LeNet-5.md`, and
`hgc/hgc_convolution.md`. Vue in the browser, Deno on the server, and WebSocket
messages for computation. LeNet-5 is at `/`; the convolution lab is at
`/convolution/`. The header links between them.

## Run

Install **Deno 2**, then run from this directory:

```sh
deno task start
```

Deno installs the pinned Vue dependency automatically. Open the localhost URL
printed in the terminal (port 8000 by default). If that port is occupied,
startup tries the next available port through 8009. To explicitly select a port:

```sh
PORT=8015 deno task start
```

No Node installation, separate build, Python environment, model download, or
dataset is required. The first dependency installation needs internet access;
afterward, all app assets and computations are local. The server binds to
`127.0.0.1`.

## Explore

### Convolution lab

Open `/convolution/` on the same server. The default is a **32 × 32 × 1**
grayscale image and a 3 × 3 vertical-edge filter.

- **Run convolution**, **Pause**, and **Step** move the visible kernel grid
  across the input, one output pixel at a time. Speed ranges from 1 to 60
  cells/second. **Show result** reveals the full output for immediate
  inspection.
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
  one output cell. Other inputs include shapes, an edge, a checkerboard, a
  gradient, and uploaded PNG/JPEG/WebP images up to 10 MB. Uploads preserve
  aspect ratio with black margins and convert to grayscale `[0, 1]`; input sizes
  range from 3 to 64 pixels per side.

The default operation is unflipped cross-correlation, following the CNN
convention documented in
[PyTorch Conv2d](https://docs.pytorch.org/docs/stable/generated/torch.nn.Conv2d.html).
Enable **Flip kernel 180°** to compare with mathematical convolution. This tool
has one input channel, one filter, dilation 1, no bias, and no activation.
Output values are raw sums and can be negative or greater than 1. Heatmap colors
use a symmetric range from the full result; inspecting values does not clip
them. The display rounds to four decimals; arithmetic uses full JavaScript
number precision.

The server computes the full output over WebSocket. Playback progressively
reveals it, while the browser uses the same pure numerical module for exact cell
inspection. Request IDs discard outdated responses; reconnecting resets the
scan. Expand **Activity** for key client/server events.

### LeNet-5 lab

1. Draw a digit, choose a hand-drawn example, or upload a PNG, JPEG, or WebP.
   Uploads preserve aspect ratio, convert to grayscale, and detect light/dark
   backgrounds. Use **Invert** to correct the detected polarity.
2. **Run network** animates the actual forward pass. **Step** computes one
   stage, starting with input normalization. Pause, inspect, then resume at any
   point.
3. Select a completed layer, a feature map, and a cell. The inspector shows its
   actual input patch, weights, sum, bias, and activation. Scroll to zoom, drag
   to pan, or use the arrow keys to choose cells. For C3/C5, choose a connected
   input map to inspect its part of the calculation; the sum includes all
   connections.
4. Try **Silence map 0** or edit the callback, enable it, and **Apply & rerun**.
   Callback results become the next layer's real inputs. Editing the draft alone
   does not change an active run. Changes to the input invalidate prior results;
   enable **Auto-run** to recompute after edits.

The callback receives `value`, the channel-major flat `index`, and `layer`
(`id`, `width`, `height`, `channels`, and other metadata). It runs on normalized
Input and on C1 through F6 after scaled tanh; it does not modify final softmax
scores. For example:

```js
const channel = Math.floor(index / (layer.width * layer.height));
return layer.id === "C1" && channel === 0 ? 0 : value;
```

Callbacks execute in short-lived browser Web Workers with a one-second timeout.
Results must be finite numbers in `[-100, 100]`. The worker cannot access the
DOM; its content security policy blocks network access and imported scripts. The
server receives only validated numeric arrays, never callback source code. These
controls support local experiments; this is not a hosted multi-user code
service. Heatmap colors saturate at the displayed limits; inspection retains
exact values.

## Model scope

**All weights are untrained.** Softmax scores are demonstrations of computation,
not calibrated confidence or meaningful digit predictions. Parameters use a
deterministic seed of 1998, making interventions reproducible. Sample digits are
drawings, not MNIST data. No training or backpropagation is implemented yet.

The feature extractor follows the architecture described in
[LeCun et al., 1998, Section II-B](https://leon.bottou.org/papers/lecun-98h)
([paper PDF mirror](https://gwern.net/doc/ai/nn/cnn/1998-lecun.pdf)):

| Stage                        | Output (channels × height × width) | Parameters |
| ---------------------------- | ---------------------------------- | ---------: |
| Input                        | 1 × 32 × 32                        |          0 |
| C1: 5 × 5 valid convolution  | 6 × 28 × 28                        |        156 |
| S2: 2 × 2 subsampling        | 6 × 14 × 14                        |         12 |
| C3: 5 × 5 sparse convolution | 16 × 10 × 10                       |      1,516 |
| S4: 2 × 2 subsampling        | 16 × 5 × 5                         |         32 |
| C5: 5 × 5 convolution        | 120 × 1 × 1                        |     48,120 |
| F6: dense                    | 84 × 1 × 1                         |     10,164 |
| Output: dense + softmax      | 10 × 1 × 1                         |        850 |
| **Total**                    |                                    | **60,850** |

C3 uses the paper's 60 map connections. S2/S4 use an average, per-map scale and
bias, then `1.7159 * tanh(2 * z / 3)`. Scale starts at 1 and bias at 0. This is
a reparameterization of scaled summation. All convolution and F6 outputs use the
same scaled tanh. Convolution means unflipped cross-correlation.

Two explicit differences from the historical model: input uses `[-1, 1]`
normalization, and a modern dense/softmax output replaces the Euclidean RBF
head. The interface labels these differences. Weights use a deterministic random
initialization for exploration rather than reproducing the paper's training.

## Development and checks

```sh
deno task test
deno task check
```

The numerical tests cover convolution fixtures, flipped kernels, stride, zero
padding, validation, and inspector agreement, as well as LeNet-5 tensor
dimensions, actual parameter counts, convolution orientation, subsampling,
sparse connections, stable softmax, reproducibility, inspector agreement,
invalid input, and protocol ordering with interventions.

With Google Chrome installed, run the optional browser regression check:

```sh
deno task test:browser
deno task test:convolution:browser
```

This installs pinned Playwright Core on demand, starts its own local server on
an available port, and checks inference, inspection, callbacks and their error
paths, stepping, drawing, uploads, and mobile layout. Set `CHROME_PATH` if
Chrome is not at `/usr/bin/google-chrome`. Screenshots go into a temporary
directory printed by the test. Chrome runs headlessly; no browser binary is
downloaded. The convolution browser check covers playback, kernel editing,
callbacks and error recovery, uploads, zoom/pan, keyboard inspection, protocol
validation, and mobile layout.

| File                                  | Responsibility                                                   |
| ------------------------------------- | ---------------------------------------------------------------- |
| `LeNet-5/model.ts`                    | Pure numerical model; shared forward/inspection calculations     |
| `LeNet-5/protocol.ts`                 | Per-WebSocket run state, validation, layer ordering              |
| `LeNet-5/server.ts`                   | Deno HTTP assets, health check, WebSocket transport, server logs |
| `LeNet-5/public/app.js`               | Vue UI, one reactive store, drawing, heatmaps, playback          |
| `LeNet-5/public/hook-worker.js`       | Browser callback execution                                       |
| `LeNet-5/tests/`                      | Numerical, protocol, and browser checks                          |
| `Convolution/server.ts`               | Convolution assets, validated WebSocket computation, logs        |
| `Convolution/public/math.js`          | Shared convolution and cell-inspection arithmetic                |
| `Convolution/public/app.js`           | Convolution Vue UI, image input, canvas overlay, playback        |
| `Convolution/public/kernel-worker.js` | Kernel callback execution                                        |
| `Convolution/tests/`                  | Numerical fixtures and browser regression checks                 |

WebSocket flow: `hello` → `start {runId, pixels}` → `layer` →
`next {runId, index, values}` → `layer`. The client applies its callback before
each `next`. `inspect {runId, requestId, index, channel, x, y}` uses the input
actually consumed by that layer. Run IDs discard stale responses; request IDs
keep cell inspection current. Reconnection discards partial runs. Browser and
terminal logs report key events, shapes, and server computation times.

The framework setup uses Vue's
[self-hosted browser build](https://vuejs.org/guide/quick-start#using-vue-from-cdn)
and Deno's
[WebSocket API](https://docs.deno.com/examples/http_server_websocket/).
# computervisionmachinelearning
