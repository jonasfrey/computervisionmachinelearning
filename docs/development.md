# Development guide

[← Vision Lab](../README.md) · [Convolution](../Convolution/README.md) ·
[LeNet-5](../LeNet-5/README.md)

## Runtime and configuration

Both labs use Vue in the browser, one reactive store per app, and Deno for HTTP
and WebSocket computation. The shared entry point is
[`LeNet-5/server.ts`](../LeNet-5/server.ts); it serves LeNet-5 at `/` and
delegates `/convolution/` to
[`Convolution/server.ts`](../Convolution/server.ts).

Run all commands below from the repository root. `deno task start` installs the
pinned Vue dependency automatically. The first dependency installation needs
internet access; afterward, all app assets and computations are local. No Node
installation, separate build, Python environment, model download, or dataset is
required. The server binds to `127.0.0.1`.

The default port is 8000. If occupied, startup tries ports through 8009. To
select a specific port in a POSIX shell:

```sh
PORT=8015 deno task start
```

In PowerShell, set `$env:PORT = "8015"` before running `deno task start`. An
explicitly selected port must be available; startup will not try another.

## Checks

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

## Code layout

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
| `Convolution/public/pixel-map.js`     | Cached canvas rendering, zoom, pan, and pixel selection          |
| `Convolution/public/images/`          | Bundled CC0 photographs and source credits                       |
| `Convolution/public/kernel-worker.js` | Kernel callback execution                                        |
| `Convolution/tests/`                  | Numerical fixtures and browser regression checks                 |

## Computation and inspection

### LeNet-5

WebSocket flow: `hello` → `start {runId, pixels}` → `layer` →
`next {runId, index, values}` → `layer`. The client applies its callback before
each `next`. `inspect {runId, requestId, index, channel, x, y}` uses the input
actually consumed by that layer. Run IDs discard stale responses; request IDs
keep cell inspection current. Reconnection discards partial runs. Browser and
terminal logs report key events, shapes, and server computation times.

### Convolution

WebSocket flow: `hello` → `compute {requestId, config}` →
`result {requestId, size, values, elapsed}`. The server validates the input and
computes the full output. The browser reveals cells during playback and uses
[`math.js`](../Convolution/public/math.js), the same numerical module, to
inspect individual cells. Instant mode reveals the full result on arrival,
including after edits or callbacks. Request IDs discard stale responses;
reconnecting recomputes the configuration in the selected playback mode. Client
and server logs report configuration changes and computation times.

Inputs support up to 512 × 512 grayscale pixels. The compute message limit is 6
MB to accommodate the JSON pixel array. Full-image convolution uses a direct
numerical loop; per-product inspection objects are created only for the selected
cell. Canvas rendering caches a raster for each input/result, then draws the
scan overlay and visible labels separately. Resizing photographs samples the
retained original bitmap. Sample assets are bundled locally with
[source credits](../Convolution/public/images/README.md).

Callbacks in both labs run in short-lived browser workers. Only validated
numeric results reach the server. See each lab's guide for its callback
arguments, limits, and application timing.

## Project notes and references

The [project brief](../hgc/hgc_project_info.md) describes the intended audience,
teaching goals, and stack. The [README brief](../hgc/hgc_readme.md) calls for a
compact entry point with detailed material in linked guides. Individual tool
briefs are in [hgc/LeNet-5.md](../hgc/LeNet-5.md) and
[hgc/hgc_convolution.md](../hgc/hgc_convolution.md).

The framework setup uses Vue's
[self-hosted browser build](https://vuejs.org/guide/quick-start#using-vue-from-cdn)
and Deno's
[WebSocket API](https://docs.deno.com/examples/http_server_websocket/).
