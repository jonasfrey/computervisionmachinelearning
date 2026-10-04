import {
  activate,
  C3_CONNECTIONS,
  LAYERS,
  LeNet,
  softmax,
  tensor,
} from "../model.ts";
import { Session } from "../protocol.ts";

function assert(
  condition: unknown,
  message = "Assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}
function close(actual: number, expected: number, tolerance = 1e-10) {
  assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}
function throws(callback: () => unknown) {
  let threw = false;
  try {
    callback();
  } catch {
    threw = true;
  }
  assert(threw, "Expected rejection");
}

Deno.test("LeNet dimensions and actual parameter counts match the architecture", () => {
  const model = new LeNet();
  let input = model.input(Array.from({ length: 1024 }, (_, i) => i % 2));
  close(input.data[0], -1);
  close(input.data[1], 1);
  let count = 0;
  for (let index = 1; index < LAYERS.length; index++) {
    const layer = LAYERS[index];
    input = model.forward(index, input);
    assert(input.data.length === layer.channels * layer.width * layer.height);
    assert(
      input.width === layer.width && input.height === layer.height &&
        input.channels === layer.channels,
    );
    assert(input.data.every(Number.isFinite));
    const params = model.parameters[index];
    const size = params.weights.reduce((sum, weights) =>
      sum + weights.length, 0) + params.biases.length;
    assert(size === layer.parameters, `Wrong parameter count for ${layer.id}`);
    count += size;
  }
  close(input.data.reduce((sum, value) => sum + value, 0), 1);
  assert(count === 60850);
});

Deno.test("C1 uses valid, unflipped 5 × 5 cross-correlation and scaled tanh", () => {
  const model = new LeNet();
  const input = tensor(
    LAYERS[0],
    Array.from({ length: 1024 }, (_, i) => (i % 32) / 32),
  );
  model.parameters[1].weights[0].fill(0);
  model.parameters[1].weights[0][0] = 2;
  model.parameters[1].weights[0][24] = -1;
  model.parameters[1].biases[0] = 0.3;
  const output = model.forward(1, input);
  close(output.data[3 * 28 + 2], activate(2 * (2 / 32) - (6 / 32) + 0.3));
});

Deno.test("subsampling averages each disjoint 2 × 2 window before scale, bias, and tanh", () => {
  const model = new LeNet();
  const input = tensor(LAYERS[1], Array(6 * 28 * 28).fill(0));
  input.data[0] = 1;
  input.data[1] = 2;
  input.data[28] = 3;
  input.data[29] = 4;
  model.parameters[2].weights[0][0] = 0.2;
  model.parameters[2].biases[0] = -0.1;
  const output = model.forward(2, input);
  close(output.data[0], activate(0.4));
  close(output.data[1], activate(-0.1));
  close(output.data[14], activate(-0.1));
});

Deno.test("C3 sparsity excludes unconnected maps and combines connected maps", () => {
  const model = new LeNet();
  assert(C3_CONNECTIONS.reduce((sum, maps) => sum + maps.length, 0) === 60);
  assert(new Set(C3_CONNECTIONS.map((maps) => maps.join(","))).size === 16);
  const input = tensor(LAYERS[2], Array(6 * 14 * 14).fill(0));
  input.data.fill(1, 5 * 196);
  model.parameters[3].weights.forEach((weights) => weights.fill(0.01));
  const output = model.forward(3, input);
  close(output.data[0], 0); // map 0 only sees S2 maps 0, 1, 2
  close(output.data[3 * 100], activate(0.25)); // map 3 sees maps 3, 4, 5
});

Deno.test("inspected cells reproduce the actual output in every computed layer", () => {
  const model = new LeNet();
  let input = model.input(
    Array.from({ length: 1024 }, (_, i) => (i % 17) / 16),
  );
  for (let index = 1; index < LAYERS.length; index++) {
    const layer = LAYERS[index],
      channel = layer.channels - 1,
      x = layer.width - 1,
      y = layer.height - 1;
    const detail = model.inspect(index, input, channel, x, y);
    const output = model.forward(index, input);
    close(
      detail.activation,
      output.data[channel * layer.width * layer.height + y * layer.width + x],
    );
    close(
      detail.sum,
      detail.terms.reduce((sum, term) => sum + term.input * term.weight, 0),
    );
    input = output;
  }
});

Deno.test("initialization is reproducible and softmax stays stable at large logits", () => {
  assert(
    JSON.stringify(new LeNet().parameters) ===
      JSON.stringify(new LeNet().parameters),
  );
  assert(
    JSON.stringify(new LeNet(42).parameters) !==
      JSON.stringify(new LeNet().parameters),
  );
  const scores = softmax([10000, 10000, -10000]);
  close(scores[0], 0.5);
  close(scores[1], 0.5);
  close(scores[2], 0);
});

Deno.test("invalid pixels, shapes, layers, and inspection coordinates are rejected", () => {
  const model = new LeNet();
  throws(() => model.input([]));
  for (const value of [NaN, Infinity, -1, 2, "1", null]) {
    const pixels = Array(1024).fill(0);
    pixels[0] = value;
    throws(() => model.input(pixels));
  }
  const input = model.input(Array(1024).fill(0));
  throws(() => model.forward(0, input));
  throws(() => model.forward(1.5, input));
  throws(() => model.forward(2, input));
  throws(() => model.inspect(1, input, 6, 0, 0));
  throws(() => model.inspect(1, input, 0, 28, 0));
  throws(() => model.inspect(1, input, 0, 0.5, 0));
});

Deno.test("protocol enforces run order and propagates edited activations into real downstream math", () => {
  const session = new Session();
  session.handle({ type: "start", runId: "one", pixels: Array(1024).fill(1) });
  throws(() =>
    session.handle({ type: "next", runId: "one", index: 2, values: [] })
  );
  throws(() =>
    session.handle({
      type: "next",
      runId: "old",
      index: 1,
      values: Array(1024).fill(0),
    })
  );
  const result = session.handle({
    type: "next",
    runId: "one",
    index: 1,
    values: Array(1024).fill(0),
  });
  assert(
    (result.tensor as { data: number[] }).data.every((value) => value === 0),
  );
  const detail = session.handle({
    type: "inspect",
    runId: "one",
    index: 1,
    channel: 0,
    x: 0,
    y: 0,
  });
  assert(
    (detail.detail as { terms: { input: number }[] }).terms.every((term) =>
      term.input === 0
    ),
  );
  throws(() =>
    session.handle({
      type: "next",
      runId: "one",
      index: 1,
      values: Array(1024).fill(0),
    })
  );
  session.handle({ type: "start", runId: "two", pixels: Array(1024).fill(0) });
  throws(() =>
    session.handle({
      type: "inspect",
      runId: "two",
      index: 1,
      channel: 0,
      x: 0,
      y: 0,
    })
  );
});
