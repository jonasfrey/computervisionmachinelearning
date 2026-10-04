# LeNet-5 lab

[← Vision Lab](../README.md) · [Development guide](../docs/development.md)

Follow an image through an untrained neural network, inspect its intermediate
values, and change activations with JavaScript callbacks. Open `/` on the local
server; see [Run locally](../README.md#run-locally) for setup.

## Explore

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
