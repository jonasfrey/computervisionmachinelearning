/** LeNet-5 feature extractor with a modern dense + softmax output head.
 * Channel-major tensors; cross-correlation is used for convolution.
 * Parameters are deterministic, randomly initialized, and NOT trained.
 */
export type Tensor = {
  channels: number;
  width: number;
  height: number;
  data: number[];
};
export type Layer = {
  id: string;
  name: string;
  kind: "input" | "conv" | "pool" | "dense" | "output";
  channels: number;
  width: number;
  height: number;
  parameters: number;
  description: string;
};

export const LAYERS: Layer[] = [
  {
    id: "input",
    name: "Input",
    kind: "input",
    channels: 1,
    width: 32,
    height: 32,
    parameters: 0,
    description:
      "A 32 × 32 grayscale image. Pixel intensities are mapped from [0, 1] to [−1, 1].",
  },
  {
    id: "C1",
    name: "Convolution",
    kind: "conv",
    channels: 6,
    width: 28,
    height: 28,
    parameters: 156,
    description:
      "Six 5 × 5 filters slide over the image with stride 1 and no padding. Each weighted sum passes through scaled tanh.",
  },
  {
    id: "S2",
    name: "Subsampling",
    kind: "pool",
    channels: 6,
    width: 14,
    height: 14,
    parameters: 12,
    description:
      "Each 2 × 2 average is multiplied by a per-map learnable scale, then a bias is added and scaled tanh is applied. Stride 2 halves the spatial dimensions.",
  },
  {
    id: "C3",
    name: "Convolution",
    kind: "conv",
    channels: 16,
    width: 10,
    height: 10,
    parameters: 1516,
    description:
      "Sixteen 5 × 5 filters combine selected S2 maps using the original sparse connection table. Different maps see different combinations of features.",
  },
  {
    id: "S4",
    name: "Subsampling",
    kind: "pool",
    channels: 16,
    width: 5,
    height: 5,
    parameters: 32,
    description:
      "Another learnable 2 × 2 average-subsampling operation compresses each map to 5 × 5, followed by scaled tanh.",
  },
  {
    id: "C5",
    name: "Convolution",
    kind: "conv",
    channels: 120,
    width: 1,
    height: 1,
    parameters: 48120,
    description:
      "Each of 120 filters spans all sixteen 5 × 5 maps. Each filter produces one value; at this input size, the operation is equivalent to a dense layer.",
  },
  {
    id: "F6",
    name: "Fully connected",
    kind: "dense",
    channels: 84,
    width: 1,
    height: 1,
    parameters: 10164,
    description:
      "Each of 84 units combines all 120 C5 values with its own weights and bias, followed by scaled tanh.",
  },
  {
    id: "output",
    name: "Output scores",
    kind: "output",
    channels: 10,
    width: 1,
    height: 1,
    parameters: 850,
    description:
      "A modern dense layer and softmax produce ten normalized scores. The original LeNet-5 used Euclidean RBF outputs. These weights are untrained: scores are not meaningful predictions.",
  },
];

export const C3_CONNECTIONS = [
  [0, 1, 2],
  [1, 2, 3],
  [2, 3, 4],
  [3, 4, 5],
  [0, 4, 5],
  [0, 1, 5],
  [0, 1, 2, 3],
  [1, 2, 3, 4],
  [2, 3, 4, 5],
  [0, 3, 4, 5],
  [0, 1, 4, 5],
  [0, 1, 2, 5],
  [0, 1, 3, 4],
  [1, 2, 4, 5],
  [0, 2, 3, 5],
  [0, 1, 2, 3, 4, 5],
];

export const activate = (value: number) => 1.7159 * Math.tanh((2 / 3) * value);

export function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exponents = values.map((value) => Math.exp(value - max));
  const total = exponents.reduce((sum, value) => sum + value, 0);
  return exponents.map((value) => value / total);
}

export function validateValues(
  value: unknown,
  length: number,
  min = -100,
  max = 100,
): asserts value is number[] {
  if (
    !Array.isArray(value) || value.length !== length ||
    !value.every((item) =>
      typeof item === "number" && Number.isFinite(item) && item >= min &&
      item <= max
    )
  ) {
    throw new Error(`Expected ${length} finite numbers in [${min}, ${max}].`);
  }
}

export function tensor(layer: Layer, data: number[]): Tensor {
  return {
    channels: layer.channels,
    width: layer.width,
    height: layer.height,
    data,
  };
}

type Parameters = {
  weights: number[][];
  biases: number[];
  connections: number[][];
};
export type Term = {
  input: number;
  weight: number;
  product: number;
  channel: number;
  x: number;
  y: number;
};

export class LeNet {
  readonly parameters: Parameters[];
  constructor(readonly seed = 1998) {
    let state = seed >>> 0;
    const random = () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    this.parameters = LAYERS.map((layer, index) => {
      if (!index) return { weights: [], biases: [], connections: [] };
      const previous = LAYERS[index - 1];
      const connections = Array.from(
        { length: layer.channels },
        (_, channel) =>
          layer.kind === "pool"
            ? [channel]
            : layer.id === "C3"
            ? [...C3_CONNECTIONS[channel]]
            : Array.from({ length: previous.channels }, (_, input) => input),
      );
      const weights = connections.map((inputs) => {
        if (layer.kind === "pool") return [1];
        const size = inputs.length * (layer.kind === "conv" ? 25 : 1);
        const limit = Math.sqrt(6 / (size + layer.channels));
        return Array.from({ length: size }, () => (random() * 2 - 1) * limit);
      });
      return { weights, biases: Array(layer.channels).fill(0), connections };
    });
  }

  input(pixels: unknown): Tensor {
    validateValues(pixels, 1024, 0, 1);
    return tensor(LAYERS[0], pixels.map((pixel) => pixel * 2 - 1));
  }

  private validateInput(index: number, input: Tensor) {
    if (!Number.isInteger(index) || index < 1 || index >= LAYERS.length) {
      throw new Error("Invalid layer.");
    }
    const previous = LAYERS[index - 1];
    if (
      input.channels !== previous.channels || input.width !== previous.width ||
      input.height !== previous.height
    ) {
      throw new Error("Input tensor shape does not match the preceding layer.");
    }
    validateValues(
      input.data,
      previous.channels * previous.width * previous.height,
    );
  }

  /** Shared by forward and inspector, so the displayed terms are the actual calculation. */
  private terms(
    index: number,
    input: Tensor,
    channel: number,
    x: number,
    y: number,
  ): Term[] {
    const layer = LAYERS[index];
    const params = this.parameters[index];
    const terms: Term[] = [];
    const kernel = layer.kind === "pool" ? 2 : layer.kind === "conv" ? 5 : 1;
    const stride = layer.kind === "pool" ? 2 : 1;
    let weightIndex = 0;
    for (const source of params.connections[channel]) {
      for (let ky = 0; ky < kernel; ky++) {
        for (let kx = 0; kx < kernel; kx++) {
          const px = x * stride + kx;
          const py = y * stride + ky;
          const value = input
            .data[
              source * input.width * input.height + py * input.width + px
            ];
          const weight = layer.kind === "pool"
            ? params.weights[channel][0] / 4
            : params.weights[channel][weightIndex++];
          terms.push({
            input: value,
            weight,
            product: value * weight,
            channel: source,
            x: px,
            y: py,
          });
        }
      }
    }
    return terms;
  }

  forward(index: number, input: Tensor): Tensor {
    this.validateInput(index, input);
    const layer = LAYERS[index];
    const data: number[] = [];
    for (let channel = 0; channel < layer.channels; channel++) {
      for (let y = 0; y < layer.height; y++) {
        for (let x = 0; x < layer.width; x++) {
          const sum = this.terms(index, input, channel, x, y).reduce(
            (sum, term) => sum + term.product,
            this.parameters[index].biases[channel],
          );
          data.push(layer.kind === "output" ? sum : activate(sum));
        }
      }
    }
    return tensor(layer, layer.kind === "output" ? softmax(data) : data);
  }

  inspect(index: number, input: Tensor, channel: number, x: number, y: number) {
    this.validateInput(index, input);
    const layer = LAYERS[index];
    if (
      ![channel, x, y].every(Number.isInteger) || channel < 0 ||
      channel >= layer.channels ||
      x < 0 || x >= layer.width || y < 0 || y >= layer.height
    ) throw new Error("Cell is outside this layer.");
    const terms = this.terms(index, input, channel, x, y);
    const bias = this.parameters[index].biases[channel];
    const sum = terms.reduce((sum, term) => sum + term.product, 0);
    const preactivation = sum + bias;
    return {
      layer: layer.id,
      channel,
      x,
      y,
      terms,
      bias,
      sum,
      preactivation,
      activation: layer.kind === "output"
        ? this.forward(index, input).data[channel]
        : activate(preactivation),
      connections: this.parameters[index].connections[channel],
      scale: layer.kind === "pool"
        ? this.parameters[index].weights[channel][0]
        : null,
    };
  }
}
