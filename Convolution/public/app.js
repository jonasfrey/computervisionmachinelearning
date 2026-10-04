import {
  computed,
  createApp,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "/vue.js";
import { inspect, outputSize, validate } from "./math.js";

const presets = {
  edge: {
    name: "Vertical edges",
    values: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
    hint:
      "Responds to changes from left to right. Try a horizontal edge instead.",
  },
  horizontal: {
    name: "Horizontal edges",
    values: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
    hint:
      "Responds to changes from top to bottom. Compare it with vertical edges.",
  },
  blur: {
    name: "Box blur",
    values: Array(9).fill(1 / 9),
    hint:
      "Nine equal weights average a neighborhood. What happens near a padded border?",
  },
  sharpen: {
    name: "Sharpen",
    values: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    hint:
      "The center is amplified and its neighbors subtracted. Values can leave [0, 1].",
  },
  identity: {
    name: "Identity",
    values: [0, 0, 0, 0, 1, 0, 0, 0, 0],
    hint:
      "Only the center contributes. Set padding to 1 to keep the original image size.",
  },
};

function samplePixels(name, size) {
  return Array.from({ length: size * size }, (_, i) => {
    const x = (i % size + 0.5) / size, y = (Math.floor(i / size) + 0.5) / size;
    if (name === "edge") return x >= 0.5 ? 1 : 0;
    if (name === "checker") return (Math.floor(x * 4) + Math.floor(y * 4)) % 2;
    if (name === "gradient") return (i % size) / (size - 1);
    if (name === "tiny") return [0, 0, 0, 0, 1, 1, 0, 1, 1][i];
    const square = x > 0.14 && x < 0.55 && y > 0.17 && y < 0.62;
    const circle = Math.hypot(x - 0.68, y - 0.65) < 0.20;
    const line = x > 0.65 && x < 0.84 && y > 0.17 && y < 0.30;
    return square ? 1 : circle ? 0.65 : line ? 0.35 : 0;
  });
}

export const store = reactive({
  connected: false,
  pending: false,
  error: "",
  size: 32,
  pixels: samplePixels("shapes", 32),
  inputName: "Geometric shapes",
  sample: "shapes",
  kernelSize: 3,
  kernel: [...presets.edge.values],
  preset: "edge",
  stride: 1,
  padding: 0,
  flip: false,
  speed: 12,
  output: [],
  outputSize: 30,
  resultConfig: null,
  cursor: -1,
  revealed: 0,
  playing: false,
  zoomKey: 0,
  hoveredTerm: -1,
  hookDraft:
    "// Average every pixel in the neighborhood.\nreturn 1 / (size * size);",
  hookBusy: false,
  logs: [],
  uploadBusy: false,
});

export function fmt(value) {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) < 0.0000001 ? "0" : String(Number(value.toFixed(4)));
}

const PixelMap = {
  props: {
    values: Array,
    size: Number,
    padding: { default: 0 },
    overlay: Object,
    selected: Object,
    revealed: { default: Infinity },
    signed: Boolean,
    scale: { default: 1 },
    label: String,
  },
  emits: ["cell"],
  setup(props, { emit }) {
    const canvas = ref(null);
    let zoom = 1, panX = 0, panY = 0, drag = null;
    const dimension = () => props.size + 2 * props.padding;
    function draw() {
      if (!canvas.value) return;
      const ctx = canvas.value.getContext("2d");
      const cell = 640 / dimension();
      ctx.fillStyle = "#e9ece4";
      ctx.fillRect(0, 0, 640, 640);
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);
      for (let y = 0; y < dimension(); y++) {
        for (let x = 0; x < dimension(); x++) {
          const px = x - props.padding, py = y - props.padding;
          const padded = px < 0 || py < 0 || px >= props.size ||
            py >= props.size;
          const index = py * props.size + px;
          const value = props.values?.[index];
          const hidden = index >= props.revealed || !Number.isFinite(value);
          if (padded) ctx.fillStyle = (x + y) % 2 ? "#bcc8b0" : "#cdd6c4";
          else if (hidden) ctx.fillStyle = (x + y) % 2 ? "#e8ece4" : "#e3e8de";
          else if (props.signed) {
            const t = Math.min(1, Math.abs(value) / props.scale);
            const end = value < 0 ? [42, 117, 134] : [192, 115, 47];
            ctx.fillStyle = `rgb(${
              end.map((v) => Math.round(247 + (v - 247) * t)).join(",")
            })`;
          } else {
            const v = Math.round(value * 255);
            ctx.fillStyle = `rgb(${v},${v},${v})`;
          }
          ctx.fillRect(x * cell, y * cell, cell + 0.3, cell + 0.3);
          if (dimension() <= 10 || zoom >= 2) {
            ctx.strokeStyle = props.signed || padded
              ? "#b9c2b350"
              : "#88888860";
            ctx.lineWidth = 0.6 / zoom;
            ctx.strokeRect(x * cell, y * cell, cell, cell);
          }
          if (cell * zoom > 43 && !hidden && !padded) {
            ctx.fillStyle = props.signed || value > 0.5 ? "#1b2925" : "#eeeeee";
            ctx.font = `${Math.min(22, cell * 0.24)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
              fmt(value),
              (x + 0.5) * cell,
              (y + 0.5) * cell,
              cell * 0.9,
            );
          }
        }
      }
      if (props.overlay) {
        const { x, y, size, term } = props.overlay;
        ctx.fillStyle = "#d5ed922a";
        ctx.fillRect(x * cell, y * cell, size * cell, size * cell);
        ctx.strokeStyle = "#d5ed92";
        ctx.lineWidth = 1.5 / zoom;
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            ctx.strokeRect((x + col) * cell, (y + row) * cell, cell, cell);
          }
        }
        ctx.lineWidth = 3 / zoom;
        ctx.strokeRect(x * cell, y * cell, size * cell, size * cell);
        if (term >= 0) {
          ctx.fillStyle = "#d5ed9277";
          ctx.fillRect(
            (x + term % size) * cell,
            (y + Math.floor(term / size)) * cell,
            cell,
            cell,
          );
        }
      }
      if (props.selected) {
        const { x, y } = props.selected;
        ctx.lineWidth = 4 / zoom;
        ctx.strokeStyle = "#253d2b";
        ctx.strokeRect(
          x * cell + 1 / zoom,
          y * cell + 1 / zoom,
          cell - 2 / zoom,
          cell - 2 / zoom,
        );
      }
      ctx.restore();
    }
    function point(event) {
      const box = canvas.value.getBoundingClientRect();
      return {
        x: (event.clientX - box.left) * 640 / box.width,
        y: (event.clientY - box.top) * 640 / box.height,
      };
    }
    function wheel(event) {
      event.preventDefault();
      const p = point(event),
        next = Math.max(
          1,
          Math.min(12, zoom * Math.exp(-event.deltaY * 0.002)),
        );
      panX = p.x - (p.x - panX) * next / zoom;
      panY = p.y - (p.y - panY) * next / zoom;
      zoom = next;
      if (zoom === 1) panX = panY = 0;
      draw();
    }
    function down(event) {
      const p = point(event);
      drag = { ...p, lastX: p.x, lastY: p.y, moved: false };
      canvas.value.setPointerCapture(event.pointerId);
    }
    function move(event) {
      if (!drag) return;
      const p = point(event);
      if (Math.hypot(p.x - drag.x, p.y - drag.y) > 5) drag.moved = true;
      if (drag.moved) {
        panX += p.x - drag.lastX;
        panY += p.y - drag.lastY;
        draw();
      }
      drag.lastX = p.x;
      drag.lastY = p.y;
    }
    function up(event) {
      if (!drag) return;
      if (!drag.moved) {
        const p = point(event), cell = 640 / dimension();
        const x = Math.floor((p.x - panX) / zoom / cell) - props.padding;
        const y = Math.floor((p.y - panY) / zoom / cell) - props.padding;
        if (x >= 0 && y >= 0 && x < props.size && y < props.size) {
          emit("cell", { x, y });
        }
      }
      drag = null;
    }
    function keyboard(event) {
      const offsets = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (!offsets[event.key]) return;
      event.preventDefault();
      const current = props.selected || { x: 0, y: 0 },
        [dx, dy] = offsets[event.key];
      emit("cell", {
        x: Math.max(0, Math.min(props.size - 1, current.x + dx)),
        y: Math.max(0, Math.min(props.size - 1, current.y + dy)),
      });
    }
    onMounted(draw);
    watch(
      () => [
        props.values,
        props.size,
        props.padding,
        props.overlay,
        props.selected,
        props.revealed,
        props.scale,
      ],
      draw,
      { deep: true },
    );
    return {
      canvas,
      wheel,
      down,
      move,
      up,
      keyboard,
      cancel: () => drag = null,
    };
  },
  template:
    `<canvas ref="canvas" width="640" height="640" tabindex="0" :aria-label="label" @wheel="wheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel" @keydown="keyboard"></canvas>`,
};

createApp({
  components: { PixelMap },
  setup() {
    const s = store;
    let socket,
      debounce,
      timer,
      reconnect,
      requestId = 0,
      uploadId = 0,
      disposed = false,
      cancelHook;
    let submitted;
    const config = () => ({
      size: s.size,
      pixels: [...s.pixels],
      kernelSize: s.kernelSize,
      kernel: [...s.kernel],
      stride: s.stride,
      padding: s.padding,
      flip: s.flip,
    });
    const detail = computed(() =>
      s.resultConfig ? inspect(s.resultConfig, Math.max(0, s.cursor)) : null
    );
    const ready = computed(() =>
      s.connected && !s.pending && !s.hookBusy && !!s.output.length
    );
    const total = computed(() => s.output.length);
    const scale = computed(() => Math.max(0.000001, ...s.output.map(Math.abs)));
    const shape = computed(() => outputSize(config()));
    const overlay = computed(() =>
      detail.value
        ? ({
          x: detail.value.x * s.stride,
          y: detail.value.y * s.stride,
          size: s.kernelSize,
          term: s.hoveredTerm,
        })
        : null
    );
    const hint = computed(() =>
      presets[s.preset]?.hint ||
      "Change one weight, then inspect the same output pixel. Which product changed?"
    );
    function log(message, source = "client") {
      s.logs.push({ time: new Date().toLocaleTimeString(), source, message });
      s.logs = s.logs.slice(-30);
      console.info(`[convolution:${source}] ${message}`);
    }
    function pause() {
      clearTimeout(timer);
      s.playing = false;
    }
    function clearResult() {
      pause();
      s.output = [];
      s.resultConfig = null;
      s.cursor = -1;
      s.revealed = 0;
      s.hoveredTerm = -1;
    }
    function invalidate() {
      cancelHook?.();
      requestId++;
      clearTimeout(debounce);
      clearResult();
      s.error = "";
      s.pending = s.connected;
      debounce = setTimeout(compute, 100);
    }
    function compute() {
      if (!s.connected) {
        s.pending = false;
        return;
      }
      try {
        submitted = validate(config());
        s.pending = true;
        socket.send(
          JSON.stringify({
            type: "compute",
            requestId: ++requestId,
            config: submitted,
          }),
        );
      } catch (error) {
        s.pending = false;
        s.error = error.message;
      }
    }
    function connect() {
      socket = new WebSocket(
        `${
          location.protocol === "https:" ? "wss" : "ws"
        }://${location.host}/convolution/ws`,
      );
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "hello") {
          s.connected = true;
          log("Connected. Change a setting to start a fresh experiment.");
          clearTimeout(debounce);
          compute();
        } else if (message.requestId === requestId) {
          s.pending = false;
          if (message.type === "error") {
            s.error = message.message;
            return;
          }
          if (message.type !== "result") return;
          s.output = message.values;
          s.outputSize = message.size;
          s.resultConfig = submitted;
          log(
            `${s.size} × ${s.size} → ${message.size} × ${message.size}; ${message.values.length} cells computed in ${
              message.elapsed.toFixed(1)
            } ms. Ready to visualize.`,
            "server",
          );
        }
      };
      socket.onclose = () => {
        s.connected = false;
        s.pending = false;
        requestId++;
        clearResult();
        if (!disposed) {
          log("Connection lost. Reconnecting…");
          reconnect = setTimeout(connect, 1000);
        }
      };
      socket.onerror = () => socket.close();
    }
    function advance() {
      if (!ready.value || s.cursor >= total.value - 1) {
        pause();
        return;
      }
      s.cursor++;
      s.revealed = Math.max(s.revealed, s.cursor + 1);
      if (s.cursor === total.value - 1) {
        pause();
        log(
          `Scan complete. ${total.value} output pixels, ${
            s.kernelSize ** 2
          } products per pixel.`,
        );
      }
    }
    function tick() {
      if (!s.playing) return;
      advance();
      if (s.playing) timer = setTimeout(tick, 1000 / s.speed);
    }
    function play() {
      if (s.playing) {
        pause();
        log("Scan paused.");
        return;
      }
      if (!ready.value) return;
      if (s.cursor >= total.value - 1) reset();
      s.playing = true;
      log(
        `Scanning left to right in steps of ${s.stride} pixel${
          s.stride === 1 ? "" : "s"
        }.`,
      );
      tick();
    }
    function step() {
      pause();
      advance();
    }
    function reset() {
      pause();
      s.cursor = -1;
      s.revealed = 0;
    }
    function finish() {
      pause();
      s.cursor = total.value - 1;
      s.revealed = total.value;
      log("Full output revealed. Select a pixel to inspect its calculation.");
    }
    function selectCell({ x, y }) {
      if (!ready.value) return;
      pause();
      s.cursor = y * s.outputSize + x;
      s.revealed = Math.max(s.revealed, s.cursor + 1);
    }
    function selectInput({ x, y }) {
      selectCell({
        x: Math.max(
          0,
          Math.min(
            s.outputSize - 1,
            Math.round(
              (x + s.padding - Math.floor(s.kernelSize / 2)) / s.stride,
            ),
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            s.outputSize - 1,
            Math.round(
              (y + s.padding - Math.floor(s.kernelSize / 2)) / s.stride,
            ),
          ),
        ),
      });
    }
    function loadSample(name) {
      uploadId++;
      s.uploadBusy = false;
      if (name === "tiny") {
        s.size = 3;
        s.stride = 1;
        s.padding = 0;
        s.kernelSize = 3;
        s.kernel = [...presets.edge.values];
        s.preset = "edge";
      } else if (s.size === 3) s.size = 32;
      s.sample = name;
      s.pixels = samplePixels(name, s.size);
      s.inputName = {
        shapes: "Geometric shapes",
        edge: "Vertical edge",
        checker: "Checkerboard",
        gradient: "Horizontal gradient",
        tiny: "3 × 3 worked example",
      }[name];
      s.zoomKey++;
      invalidate();
      log(`Loaded ${s.inputName.toLowerCase()} (${s.size} × ${s.size}).`);
    }
    function resizeInput(event) {
      const oldSize = s.size, oldPixels = s.pixels;
      s.size = Number(event.target.value);
      uploadId++;
      s.uploadBusy = false;
      s.pixels = Array.from(
        { length: s.size ** 2 },
        (_, i) =>
          oldPixels[
            Math.min(
                oldSize - 1,
                Math.floor(Math.floor(i / s.size) * oldSize / s.size),
              ) * oldSize +
            Math.min(oldSize - 1, Math.floor(i % s.size * oldSize / s.size))
          ],
      );
      s.sample = "";
      s.zoomKey++;
      invalidate();
    }
    function preset(name) {
      s.preset = name;
      s.kernelSize = 3;
      s.kernel = [...presets[name].values];
      invalidate();
      log(`Applied ${presets[name].name.toLowerCase()} filter.`);
    }
    function resizeKernel(event) {
      s.kernelSize = Number(event.target.value);
      s.kernel = Array(s.kernelSize ** 2).fill(0);
      s.kernel[Math.floor(s.kernel.length / 2)] = 1;
      s.preset = "custom";
      invalidate();
    }
    function editKernel(index, event) {
      s.kernel[index] = event.target.value === ""
        ? ""
        : Number(event.target.value);
      s.preset = "custom";
      invalidate();
    }
    function callbackPreset(name) {
      s.hookDraft = {
        blur:
          "// Equal weights preserve a constant image away from borders.\nreturn 1 / (size * size);",
        identity:
          "const center = Math.floor(size / 2);\nreturn row === center && col === center ? 1 : 0;",
        edge:
          "// A left-to-right difference for any odd kernel size.\nconst center = Math.floor(size / 2);\nreturn col - center;",
      }[name];
    }
    async function applyHook() {
      cancelHook?.();
      s.hookBusy = true;
      s.error = "";
      pause();
      try {
        const values = await new Promise((resolve, reject) => {
          const worker = new Worker("/convolution/kernel-worker.js");
          function cleanup() {
            clearTimeout(timeout);
            worker.terminate();
            cancelHook = null;
          }
          cancelHook = () => {
            cleanup();
            s.hookBusy = false;
            resolve(null);
          };
          const timeout = setTimeout(() => {
            cleanup();
            reject(
              new Error(
                "Callback exceeded 1 second. Simplify your code and try again.",
              ),
            );
          }, 1000);
          worker.onmessage = ({ data }) => {
            cleanup();
            data.error ? reject(new Error(data.error)) : resolve(data.values);
          };
          worker.onerror = (event) => {
            event.preventDefault();
            cleanup();
            reject(new Error("Callback failed to execute."));
          };
          worker.postMessage({
            code: s.hookDraft,
            values: [...s.kernel],
            size: s.kernelSize,
          });
        });
        if (!values) return;
        validate({ ...config(), kernel: values });
        s.kernel = values;
        s.preset = "custom";
        invalidate();
        log(`Callback applied to all ${values.length} weights.`);
      } catch (error) {
        s.error = error.message;
        log(error.message);
      } finally {
        s.hookBusy = false;
      }
    }
    async function upload(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const id = ++uploadId;
      s.error = "";
      s.uploadBusy = false;
      if (
        !/^image\/(png|jpeg|webp)$/.test(file.type) ||
        file.size > 10 * 1024 * 1024
      ) {
        s.error = "Choose a PNG, JPEG, or WebP image smaller than 10 MB.";
        return;
      }
      s.uploadBusy = true;
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
        if (id !== uploadId) return;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = s.size;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, s.size, s.size);
        const ratio = Math.min(s.size / bitmap.width, s.size / bitmap.height);
        const w = bitmap.width * ratio, h = bitmap.height * ratio;
        ctx.drawImage(bitmap, (s.size - w) / 2, (s.size - h) / 2, w, h);
        const data = ctx.getImageData(0, 0, s.size, s.size).data;
        s.pixels = Array.from(
          { length: s.size ** 2 },
          (_, i) =>
            (0.2126 * data[4 * i] + 0.7152 * data[4 * i + 1] +
              0.0722 * data[4 * i + 2]) / 255,
        );
        s.inputName = file.name;
        s.sample = "";
        s.zoomKey++;
        invalidate();
        log(
          `Loaded ${file.name}; grayscale [0, 1], aspect ratio preserved with black margins.`,
        );
      } catch {
        if (id === uploadId) {
          s.error =
            "This image could not be decoded. Try another PNG, JPEG, or WebP.";
        }
      } finally {
        bitmap?.close();
        if (id === uploadId) s.uploadBusy = false;
      }
    }
    onMounted(connect);
    onUnmounted(() => {
      disposed = true;
      pause();
      clearTimeout(debounce);
      clearTimeout(reconnect);
      cancelHook?.();
      socket?.close();
    });
    return {
      s,
      presets,
      fmt,
      detail,
      ready,
      total,
      scale,
      shape,
      overlay,
      hint,
      invalidate,
      play,
      step,
      pause,
      reset,
      finish,
      selectCell,
      selectInput,
      loadSample,
      resizeInput,
      preset,
      resizeKernel,
      editKernel,
      callbackPreset,
      applyHook,
      upload,
    };
  },
}).mount("#app");
