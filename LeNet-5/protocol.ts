import { LAYERS, LeNet, type Tensor, tensor, validateValues } from "./model.ts";

/** Per-connection state. Hooks run in the browser; only validated numbers return here. */
export class Session {
  readonly model = new LeNet();
  runId = "";
  current = -1;
  inputs = new Map<number, Tensor>();
  currentTensor: Tensor | null = null;

  handle(message: Record<string, unknown>): Record<string, unknown> {
    if (message.type === "start") {
      if (typeof message.runId !== "string" || message.runId.length > 100) {
        throw new Error("Invalid run ID.");
      }
      const input = this.model.input(message.pixels);
      this.runId = message.runId;
      this.current = 0;
      this.inputs.clear();
      this.currentTensor = input;
      return {
        type: "layer",
        runId: this.runId,
        index: 0,
        tensor: input,
        elapsed: 0,
      };
    }
    if (!this.currentTensor || message.runId !== this.runId) {
      throw new Error("Start a new run first.");
    }
    if (message.type === "next") {
      if (
        message.index !== this.current + 1 || this.current >= LAYERS.length - 1
      ) throw new Error("Layers must run in order.");
      const index = this.current + 1;
      const previous = LAYERS[this.current];
      validateValues(
        message.values,
        previous.channels * previous.width * previous.height,
      );
      const input = tensor(previous, [...message.values]);
      const start = performance.now();
      const output = this.model.forward(index, input);
      this.inputs.set(index, input);
      this.current = index;
      this.currentTensor = output;
      return {
        type: "layer",
        runId: this.runId,
        index,
        tensor: output,
        elapsed: performance.now() - start,
      };
    }
    if (message.type === "inspect") {
      const index = message.index as number;
      const input = this.inputs.get(index);
      if (!input) throw new Error("Run this layer before inspecting it.");
      return {
        type: "inspection",
        runId: this.runId,
        requestId: message.requestId,
        detail: this.model.inspect(
          index,
          input,
          message.channel as number,
          message.x as number,
          message.y as number,
        ),
      };
    }
    throw new Error("Unknown message type.");
  }
}
