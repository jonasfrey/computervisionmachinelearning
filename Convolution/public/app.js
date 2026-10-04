import {
  computed,
  createApp,
  markRaw,
  onMounted,
  onUnmounted,
  reactive,
} from "/vue.js";
import { inspect, outputSize, validate } from "./math.js";
import PixelMap from "./pixel-map.js";

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

const photos = {
  cat: {
    name: "Chelsea the cat",
    author: "Stefan van der Walt",
    source: "chelsea",
  },
  coffee: { name: "Coffee cup", author: "Rachel Michetti", source: "coffee" },
};
const lessons = [
  {
    title: "A pixel is a brightness value",
    text:
      "A grayscale image is a grid of numbers. In an 8-bit image, 0 is black and 255 is white. This lab divides those numbers by 255, so its pixels range from 0 to 1.",
    task:
      "Select a square, then change its brightness. Notice how the number and the shade change together.",
  },
  {
    title: "One pixel × one weight",
    text:
      "A kernel is a small grid of weights. Start with just one: this 1 × 1 kernel multiplies each input pixel by its weight. The input here is 0.5; a weight of 1 gives 0.5, a middle gray.",
    task:
      "Change the kernel weight to 2, then press Step. The sum becomes 1, which displays as white. Try 0 to make it black.",
  },
  {
    title: "Multiply nine pairs, then add",
    text:
      "This patch has four white pixels and five black pixels. The averaging kernel has nine weights of 1/9. Its weights sum to 1, but the output is the sum of pixel × weight products: four contributions of 1/9 give 4/9 ≈ 0.4444.",
    task:
      "Compare the average with a kernel of all ones. A sum of 4 is brighter than the display can show, so grayscale clips it to white. The raw sum remains 4.",
  },
  {
    title: "Slide the same kernel across an image",
    text:
      "Every window makes one output pixel. The same weights move from left to right, then start the next row. This center-only kernel copies the middle pixel of each 3 × 3 patch.",
    task:
      "Use Step or Run to follow the window. Change stride from 1 to 2: the window jumps farther and the output shrinks from 6 × 6 to 3 × 3.",
  },
  {
    title: "Padding supplies the missing neighbors",
    text:
      "At the border, some neighbors lie outside the image. Zero padding supplies black pixels there. In this all-white example, the blur averages four real pixels and five zeros at a corner: 4/9. The center averages nine white pixels: 1.",
    task:
      "Press Step to see the corner, then click the center output cell. Compare gray with white. Remove padding to see why only one complete window remains.",
  },
  {
    title: "Apply it to a photograph",
    text:
      "The same calculation works on a large image. Instant mode reveals every output as soon as it is ready, including after a filter or callback change. Choose grayscale to see a filtered photo, or signed colors to inspect negative and positive responses.",
    task:
      "Try blur, sharpen, and edge filters on the cat. Switch to 512 × 512, then write your own weights below. Zoom into a feature and inspect the numbers behind it.",
  },
];

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
  instant: false,
  displayMode: "signed",
  lesson: -1,
  lessonPixel: 4,
  quizAnswer: "",
});

export function fmt(value) {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) < 0.0000001 ? "0" : String(Number(value.toFixed(4)));
}

const grayByte = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);

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
    let submitted, imageSource = null;
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
      s.connected && !s.pending && !s.hookBusy && !s.uploadBusy &&
      !!s.output.length
    );
    const total = computed(() => s.output.length);
    const scale = computed(() =>
      s.output.reduce((max, value) => Math.max(max, Math.abs(value)), 0.000001)
    );
    const shape = computed(() => outputSize(s));
    const lesson = computed(() => lessons[s.lesson]);
    const exploring = computed(() =>
      s.lesson < 0 || s.lesson === lessons.length - 1
    );
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
          s.output = markRaw(message.values);
          s.outputSize = message.size;
          s.resultConfig = markRaw(submitted);
          if (s.instant) reveal();
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
      reveal();
      log("Full output revealed. Select a pixel to inspect its calculation.");
    }
    function reveal() {
      s.cursor = total.value - 1;
      s.revealed = total.value;
    }
    function instantConvolve() {
      s.instant = true;
      pause();
      if (ready.value) finish();
    }
    function toggleInstant() {
      pause();
      if (s.instant && ready.value) finish();
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
      imageSource?.close();
      imageSource = null;
      if (name === "tiny") {
        s.size = 3;
        s.stride = 1;
        s.padding = 0;
        s.kernelSize = 3;
        s.kernel = [...presets.edge.values];
        s.preset = "edge";
      } else if (s.size === 3) s.size = 32;
      s.sample = name;
      s.pixels = markRaw(samplePixels(name, s.size));
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
      s.pixels = imageSource
        ? pixelsFromImage(imageSource, s.size)
        : s.sample && s.sample !== "tiny"
        ? markRaw(samplePixels(s.sample, s.size))
        : markRaw(Array.from(
          { length: s.size ** 2 },
          (_, i) =>
            oldPixels[
              Math.min(
                  oldSize - 1,
                  Math.floor(Math.floor(i / s.size) * oldSize / s.size),
                ) * oldSize +
              Math.min(oldSize - 1, Math.floor(i % s.size * oldSize / s.size))
            ],
        ));
      if (s.sample === "tiny") {
        s.sample = "";
        s.inputName = "Resized worked example";
      }
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
    function pixelsFromImage(bitmap, size) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, size, size);
      const ratio = Math.min(size / bitmap.width, size / bitmap.height);
      const w = bitmap.width * ratio, h = bitmap.height * ratio;
      ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
      const data = ctx.getImageData(0, 0, size, size).data;
      return markRaw(
        Array.from({ length: size ** 2 }, (_, i) =>
          Math.min(
            1,
            (0.2126 * data[4 * i] + 0.7152 * data[4 * i + 1] +
              0.0722 * data[4 * i + 2]) / 255,
          )),
      );
    }
    async function loadImage(readBlob, name, sample, size) {
      const id = ++uploadId;
      s.error = "";
      s.uploadBusy = true;
      pause();
      let bitmap;
      try {
        bitmap = await createImageBitmap(await readBlob());
        if (id !== uploadId || disposed) return;
        const pixels = pixelsFromImage(bitmap, size);
        imageSource?.close();
        imageSource = bitmap;
        bitmap = null;
        s.size = size;
        s.pixels = pixels;
        s.inputName = name;
        s.sample = sample;
        s.displayMode = "grayscale";
        s.zoomKey++;
        invalidate();
        log(
          `Loaded ${name} at ${size} × ${size}; grayscale [0, 1], aspect ratio preserved with black margins.`,
        );
      } catch {
        if (id === uploadId) {
          s.error =
            "This image could not be loaded. Try another image or sample.";
        }
      } finally {
        bitmap?.close();
        if (id === uploadId) s.uploadBusy = false;
      }
    }
    function loadPhoto(name, size = Math.max(256, s.size)) {
      return loadImage(
        async () => {
          const response = await fetch(`/convolution/images/${name}.png`);
          if (!response.ok) throw new Error("Photo unavailable");
          return response.blob();
        },
        photos[name].name,
        name,
        size,
      );
    }
    function upload(event) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      uploadId++;
      s.uploadBusy = false;
      if (
        !/^image\/(png|jpeg|webp)$/.test(file.type) ||
        file.size > 10 * 1024 * 1024
      ) {
        s.error = "Choose a PNG, JPEG, or WebP image smaller than 10 MB.";
        return;
      }
      return loadImage(() => Promise.resolve(file), file.name, "", s.size);
    }
    function setLesson(index) {
      pause();
      uploadId++;
      s.uploadBusy = false;
      imageSource?.close();
      imageSource = null;
      s.lesson = index;
      s.quizAnswer = "";
      s.lessonPixel = 4;
      s.instant = index === 5;
      s.displayMode = "grayscale";
      s.flip = false;
      s.stride = 1;
      s.padding = index >= 4 ? 1 : 0;
      s.kernelSize = index < 2 ? 1 : 3;
      s.size = index === 3 ? 8 : 3;
      s.preset = index === 3 ? "identity" : index >= 2 ? "blur" : "custom";
      s.kernel = index < 2 ? [1] : [...presets[s.preset].values];
      s.pixels = markRaw(
        index === 0
          ? [
            0,
            32 / 255,
            64 / 255,
            96 / 255,
            128 / 255,
            160 / 255,
            192 / 255,
            224 / 255,
            1,
          ]
          : index === 1
          ? Array(9).fill(0.5)
          : index === 2
          ? samplePixels("tiny", 3)
          : index === 3
          ? samplePixels("checker", 8)
          : Array(9).fill(1),
      );
      s.sample = "";
      s.inputName = `Lesson ${index + 1} example`;
      s.zoomKey++;
      invalidate();
      if (index === 5) loadPhoto("cat", 256);
      log(`Tutorial ${index + 1}/${lessons.length}: ${lessons[index].title}.`);
    }
    function leaveTutorial() {
      pause();
      s.lesson = -1;
    }
    function updateLessonPixel(value) {
      const pixels = [...s.pixels];
      pixels[s.lessonPixel] = Number(value) / 255;
      s.pixels = markRaw(pixels);
      invalidate();
    }
    function lessonWeights(average) {
      s.kernel = Array(9).fill(average ? 1 / 9 : 1);
      s.preset = average ? "blur" : "custom";
      invalidate();
    }
    onMounted(connect);
    onUnmounted(() => {
      disposed = true;
      uploadId++;
      imageSource?.close();
      pause();
      clearTimeout(debounce);
      clearTimeout(reconnect);
      cancelHook?.();
      socket?.close();
    });
    return {
      s,
      presets,
      photos,
      lessons,
      lesson,
      exploring,
      grayByte,
      setLesson,
      leaveTutorial,
      updateLessonPixel,
      lessonWeights,
      loadPhoto,
      instantConvolve,
      toggleInstant,
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
