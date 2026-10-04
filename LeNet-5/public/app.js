import {
  computed,
  createApp,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "/vue.js";

export const store = reactive({
  connected: false,
  layers: [],
  tensors: [],
  elapsed: [],
  pixels: Array(1024).fill(0),
  selected: 0,
  channel: 0,
  x: 14,
  y: 14,
  sourceChannel: 0,
  detail: null,
  zoomKey: 0,
  current: -1,
  runId: "",
  playing: false,
  pending: false,
  live: false,
  sample: 7,
  inputName: "Drawn example · 7",
  error: "",
  logs: [],
  hookDraft: "// Keep each activation unchanged.\nreturn value;",
  hookCode: "return value;",
  hookDraftEnabled: false,
  hookEnabled: false,
});

function color(value, min, max) {
  if (!Number.isFinite(value)) return [235, 237, 231];
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const low = [43, 101, 110], middle = [244, 244, 231], high = [201, 151, 46];
  const from = normalized < 0.5 ? low : middle;
  const to = normalized < 0.5 ? middle : high;
  const fraction = normalized < 0.5 ? normalized * 2 : (normalized - 0.5) * 2;
  return from.map((start, index) =>
    Math.round(start + (to[index] - start) * fraction)
  );
}

const HeatMap = {
  props: {
    values: Array,
    width: Number,
    height: Number,
    min: Number,
    max: Number,
    selected: Object,
    interactive: { default: true },
    label: { default: "Activation heatmap" },
  },
  emits: ["cell"],
  setup(props, { emit }) {
    const canvas = ref(null);
    let zoom = 1, panX = 0, panY = 0, drag = null;
    function render() {
      const element = canvas.value;
      if (!element) return;
      const ctx = element.getContext("2d");
      const size = element.width;
      ctx.fillStyle = "#f0f2ec";
      ctx.fillRect(0, 0, size, size);
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);
      const cellWidth = size / props.width, cellHeight = size / props.height;
      for (let y = 0; y < props.height; y++) {
        for (let x = 0; x < props.width; x++) {
          ctx.fillStyle = `rgb(${
            color(props.values?.[y * props.width + x], props.min, props.max)
              .join(",")
          })`;
          ctx.fillRect(
            x * cellWidth,
            y * cellHeight,
            cellWidth + 0.3,
            cellHeight + 0.3,
          );
        }
      }
      if (props.selected) {
        ctx.strokeStyle = "#172c27";
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(
          props.selected.x * cellWidth,
          props.selected.y * cellHeight,
          cellWidth,
          cellHeight,
        );
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1 / zoom;
        ctx.strokeRect(
          props.selected.x * cellWidth + 2 / zoom,
          props.selected.y * cellHeight + 2 / zoom,
          cellWidth - 4 / zoom,
          cellHeight - 4 / zoom,
        );
      }
      ctx.restore();
    }
    const point = (event) => {
      const rect = canvas.value.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * 360 / rect.width,
        y: (event.clientY - rect.top) * 360 / rect.height,
      };
    };
    function wheel(event) {
      if (!props.interactive) return;
      event.preventDefault();
      const p = point(event);
      const next = Math.max(
        1,
        Math.min(12, zoom * Math.exp(-event.deltaY * 0.002)),
      );
      panX = p.x - (p.x - panX) * next / zoom;
      panY = p.y - (p.y - panY) * next / zoom;
      zoom = next;
      if (zoom === 1) panX = panY = 0;
      render();
    }
    function down(event) {
      if (!props.interactive) return;
      const p = point(event);
      drag = { ...p, lastX: p.x, lastY: p.y, moved: false };
      canvas.value.setPointerCapture(event.pointerId);
    }
    function move(event) {
      if (!drag) return;
      const p = point(event);
      if (Math.hypot(p.x - drag.x, p.y - drag.y) > 4) drag.moved = true;
      if (drag.moved) {
        panX += p.x - drag.lastX;
        panY += p.y - drag.lastY;
        render();
      }
      drag.lastX = p.x;
      drag.lastY = p.y;
    }
    function up(event) {
      if (!drag) return;
      if (!drag.moved) {
        const p = point(event);
        const x = Math.floor((p.x - panX) / zoom / 360 * props.width);
        const y = Math.floor((p.y - panY) / zoom / 360 * props.height);
        if (x >= 0 && y >= 0 && x < props.width && y < props.height) {
          emit("cell", { x, y });
        }
      }
      drag = null;
    }
    function keyboard(event) {
      if (!props.interactive) return;
      const current = props.selected || { x: 0, y: 0 };
      const offsets = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (!offsets[event.key]) return;
      event.preventDefault();
      const [dx, dy] = offsets[event.key];
      emit("cell", {
        x: Math.max(0, Math.min(props.width - 1, current.x + dx)),
        y: Math.max(0, Math.min(props.height - 1, current.y + dy)),
      });
    }
    onMounted(render);
    watch(
      () => [
        props.values,
        props.width,
        props.height,
        props.selected,
        props.min,
        props.max,
      ],
      render,
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
    `<canvas ref="canvas" width="360" height="360" class="heatmap" :class="{ interactive }" :tabindex="interactive ? 0 : -1" :aria-label="label" @wheel="wheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="cancel" @lostpointercapture="cancel" @keydown="keyboard"></canvas>`,
};

createApp({
  components: { HeatMap },
  setup() {
    const s = store;
    const drawing = ref(null);
    let socket,
      playbackTimer,
      responseTimer,
      reconnectTimer,
      liveTimer,
      cancelHook;
    let destroyed = false,
      stroke = false,
      lastPoint = null,
      inspectionId = 0,
      uploadVersion = 0;
    const selectedLayer = computed(() => s.layers[s.selected]);
    const selectedTensor = computed(() =>
      s.tensors[s.selected] ||
      (s.selected === 0
        ? { data: s.pixels.map((value) => value * 2 - 1) }
        : null)
    );
    const scores = computed(() => s.tensors[7]?.data);
    const totalTime = computed(() =>
      s.elapsed.reduce((sum, value) => sum + (value || 0), 0).toFixed(1)
    );
    const visibleTerms = computed(() =>
      s.detail?.terms.filter((term) => term.channel === s.sourceChannel) || []
    );
    const challenge = computed(() =>
      ({
        input:
          "Draw the same digit a little farther left. What changes in the first feature maps?",
        C1:
          "Apply the ReLU callback. Which negative activations disappear, and how do the next layers change?",
        S2:
          "Inspect neighboring cells. Each one summarizes a different 2 × 2 patch of the same input map.",
        C3:
          "Switch output maps and compare their connected input maps. C3 does not connect every map to every filter.",
        S4:
          "Compare S2 and S4. How much spatial detail remains after the second subsampling step?",
        C5:
          "Select a unit. Its one value combines 400 products across all sixteen S4 maps.",
        F6:
          "Silence C1 map 0 with the callback, then check how far that change travels through the network.",
        output:
          "A high score alone does not mean a correct answer. These weights have never learned from labeled digits.",
      })[selectedLayer.value?.id]
    );

    function log(source, message) {
      s.logs.push({
        source,
        message,
        time: new Date().toLocaleTimeString("en-GB"),
      });
      if (s.logs.length > 100) s.logs.shift();
      console.info(`[${source}] ${message}`);
    }
    function fail(message) {
      s.error = message;
      s.playing = false;
      s.pending = false;
      clearTimeout(playbackTimer);
      clearTimeout(responseTimer);
      log("client", message);
    }
    function invalidate() {
      clearTimeout(playbackTimer);
      clearTimeout(responseTimer);
      clearTimeout(liveTimer);
      s.runId = "";
      cancelHook?.();
      s.playing = false;
      s.pending = false;
      s.current = -1;
      s.tensors = [];
      s.elapsed = [];
      s.detail = null;
      s.selected = 0;
      s.channel = 0;
      s.x = s.y = 14;
      inspectionId++;
    }
    function send(message, waiting = false) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        fail("Connection lost. Reconnecting to the server…");
        return false;
      }
      socket.send(JSON.stringify(message));
      if (waiting) {
        s.pending = true;
        clearTimeout(responseTimer);
        responseTimer = setTimeout(() => {
          s.runId = "";
          fail("The server did not respond. Start a new run to try again.");
        }, 10000);
      }
      return true;
    }
    function transform(values, layer) {
      if (!s.hookEnabled || layer.kind === "output") {
        return Promise.resolve(values);
      }
      return new Promise((resolve, reject) => {
        const worker = new Worker("/hook-worker.js");
        const finish = (error, result) => {
          clearTimeout(timeout);
          worker.terminate();
          cancelHook = null;
          error ? reject(new Error(error)) : resolve(result);
        };
        const timeout = setTimeout(
          () =>
            finish(
              "Callback exceeded 1 second. Check for loops and try again.",
            ),
          1000,
        );
        cancelHook = () => finish("Run canceled.");
        worker.onmessage = ({ data }) => {
          if (
            !Array.isArray(data.values) ||
            data.values.length !== values.length ||
            !data.values.every((value) =>
              typeof value === "number" && Number.isFinite(value) &&
              Math.abs(value) <= 100
            )
          ) {
            finish(data.error || "Callback returned invalid activations.");
          } else finish(null, data.values);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          finish(event.message || "Callback failed.");
        };
        worker.postMessage({ code: s.hookCode, values, layer: { ...layer } });
      });
    }
    async function receive(message) {
      if (message.type === "hello") {
        s.layers = message.layers;
        s.connected = true;
        log(
          "server",
          `Ready · ${
            message.layers.length - 1
          } layers · untrained weights · seed ${message.seed}`,
        );
        return;
      }
      if (message.runId !== s.runId || !s.runId) return;
      if (message.type === "error") {
        fail(message.message);
        return;
      }
      if (message.type === "inspection") {
        if (message.requestId !== inspectionId) return;
        s.detail = message.detail;
        s.sourceChannel = message.detail.connections[0];
        return;
      }
      if (message.type !== "layer") return;
      clearTimeout(responseTimer);
      const runId = s.runId;
      try {
        const layer = s.layers[message.index];
        const values = await transform(message.tensor.data, layer);
        if (s.runId !== runId) return;
        s.tensors[message.index] = { ...message.tensor, data: values };
        s.current = message.index;
        s.elapsed[message.index] = message.elapsed;
        s.pending = false;
        log(
          "server",
          `${layer.id} · ${layer.channels} × ${layer.width} × ${layer.height} · ${
            message.elapsed.toFixed(1)
          } ms`,
        );
        if (s.hookEnabled && layer.kind !== "output") {
          log(
            "client",
            `Callback applied to ${values.length.toLocaleString()} ${layer.id} activations`,
          );
        }
        selectLayer(message.index);
        if (s.current === 7) {
          s.playing = false;
          log(
            "client",
            "Forward pass complete. Select any layer or cell to inspect its calculation.",
          );
        } else if (s.playing) playbackTimer = setTimeout(sendNext, 350);
      } catch (error) {
        if (s.runId === runId) {
          s.runId = "";
          fail(error.message);
        }
      }
    }
    function connect() {
      socket = new WebSocket(
        `${
          location.protocol === "https:" ? "wss" : "ws"
        }://${location.host}/ws`,
      );
      socket.onmessage = (event) => {
        try {
          receive(JSON.parse(event.data)).catch((error) => fail(error.message));
        } catch {
          fail("Received an invalid server message.");
        }
      };
      socket.onclose = () => {
        s.connected = false;
        invalidate();
        if (!destroyed) {
          log("client", "Connection closed. Retrying in 2 seconds…");
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
      socket.onerror = () => socket.close();
    }
    function start(playing) {
      invalidate();
      s.error = "";
      s.runId = crypto.randomUUID();
      s.playing = playing;
      log("client", "Sending 1,024 grayscale pixels to the server");
      send({ type: "start", runId: s.runId, pixels: [...s.pixels] }, true);
    }
    function sendNext() {
      if (s.pending || !s.runId || s.current < 0 || s.current >= 7) return;
      send({
        type: "next",
        runId: s.runId,
        index: s.current + 1,
        values: [...s.tensors[s.current].data],
      }, true);
    }
    function step() {
      if (s.current < 0 || s.current === 7 || !s.runId) start(false);
      else sendNext();
    }
    function togglePlay() {
      if (s.playing) {
        s.playing = false;
        clearTimeout(playbackTimer);
        return;
      }
      if (s.current < 0 || s.current === 7 || !s.runId) start(true);
      else {
        s.playing = true;
        sendNext();
      }
    }
    function reset() {
      invalidate();
      s.error = "";
      log("client", "Forward pass reset. Input preserved.");
    }
    function inspect() {
      s.detail = null;
      inspectionId++;
      if (s.selected === 0 || !s.tensors[s.selected] || !s.runId) return;
      send({
        type: "inspect",
        runId: s.runId,
        requestId: inspectionId,
        index: s.selected,
        channel: s.channel,
        x: s.x,
        y: s.y,
      });
    }
    function selectLayer(index) {
      if (index !== 0 && !s.tensors[index]) return;
      s.selected = index;
      s.channel = 0;
      s.x = s.y = Math.floor(s.layers[index].width / 2);
      inspect();
    }
    function chooseChannel(channel) {
      s.channel = channel;
      inspect();
    }
    function selectCell({ x, y }) {
      s.x = x;
      s.y = y;
      inspect();
    }
    function selectUnit({ x, y }) {
      const columns = selectedLayer.value.id === "F6" ? 12 : 10;
      const channel = y * columns + x;
      if (channel < selectedLayer.value.channels) chooseChannel(channel);
    }
    function mapValues(channel) {
      const size = (selectedLayer.value?.width || 32) *
        (selectedLayer.value?.height || 32);
      return selectedTensor.value?.data.slice(
        channel * size,
        (channel + 1) * size,
      ) || [];
    }

    function ctx() {
      return drawing.value.getContext("2d", { willReadFrequently: true });
    }
    function blank() {
      const context = ctx();
      context.fillStyle = "#121d1c";
      context.fillRect(0, 0, 320, 320);
    }
    function updatePixels() {
      const small = document.createElement("canvas");
      small.width = small.height = 32;
      const context = small.getContext("2d");
      context.drawImage(drawing.value, 0, 0, 32, 32);
      const data = context.getImageData(0, 0, 32, 32).data;
      // The drawing background's red channel is 18; normalize it to true black.
      s.pixels = Array.from(
        { length: 1024 },
        (_, index) => Math.max(0, (data[index * 4] - 18) / 237),
      );
      invalidate();
      if (s.live && s.connected) liveTimer = setTimeout(() => start(true), 350);
    }
    function drawPoint(event) {
      const rect = drawing.value.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) / rect.width * 320,
        y: (event.clientY - rect.top) / rect.height * 320,
      };
    }
    function beginDraw(event) {
      if (event.button !== 0) return;
      uploadVersion++;
      invalidate();
      drawing.value.setPointerCapture(event.pointerId);
      stroke = true;
      s.sample = null;
      s.inputName = "Your drawing";
      lastPoint = drawPoint(event);
      draw(event);
    }
    function draw(event) {
      if (!stroke) return;
      const point = drawPoint(event), context = ctx();
      context.strokeStyle = "white";
      context.fillStyle = "white";
      context.lineWidth = 23;
      context.lineCap = context.lineJoin = "round";
      context.beginPath();
      context.moveTo(lastPoint.x, lastPoint.y);
      context.lineTo(point.x, point.y);
      context.stroke();
      context.beginPath();
      context.arc(point.x, point.y, 11.5, 0, Math.PI * 2);
      context.fill();
      lastPoint = point;
    }
    function endDraw() {
      if (!stroke) return;
      stroke = false;
      updatePixels();
      log("client", "Drawing resampled to 32 × 32 pixels");
    }
    function clearDrawing() {
      uploadVersion++;
      blank();
      s.sample = null;
      s.inputName = "Blank canvas";
      updatePixels();
    }
    const paths = [
      "M 18 6 C 7 3 5 24 12 26 C 24 31 28 4 18 6 Z",
      "M 10 12 L 17 6 L 16 26 M 10 26 L 23 26",
      "M 7 11 C 9 1 28 4 23 13 C 21 17 12 21 8 26 L 25 26",
      "M 8 7 C 28 0 29 17 16 16 C 31 15 26 32 8 25",
      "M 20 5 L 7 21 L 26 21 M 21 7 L 20 28",
      "M 25 6 L 10 6 L 8 16 C 25 10 31 27 15 27 L 7 24",
      "M 24 6 C 8 2 2 28 16 27 C 30 27 26 9 9 17",
      "M 7 7 L 25 7 L 13 27",
      "M 16 16 C 0 10 14 0 22 7 C 30 15 4 18 9 25 C 18 34 35 21 16 16",
      "M 23 16 C 6 23 4 3 18 5 C 32 5 25 26 10 28",
    ];
    function sample(digit) {
      uploadVersion++;
      blank();
      const context = ctx();
      context.save();
      context.scale(10, 10);
      context.strokeStyle = "white";
      context.lineWidth = 2.3;
      context.lineCap = context.lineJoin = "round";
      context.stroke(new Path2D(paths[digit]));
      context.restore();
      s.sample = digit;
      s.inputName = `Drawn example · ${digit}`;
      updatePixels();
    }
    function paintPixels() {
      const small = document.createElement("canvas");
      small.width = small.height = 32;
      const context = small.getContext("2d"),
        image = context.createImageData(32, 32);
      s.pixels.forEach((value, index) => {
        const shade = Math.round(value * 237 + 18);
        image.data.set([shade, shade, shade, 255], index * 4);
      });
      context.putImageData(image, 0, 0);
      ctx().imageSmoothingEnabled = false;
      ctx().drawImage(small, 0, 0, 320, 320);
    }
    function invert() {
      uploadVersion++;
      s.pixels = s.pixels.map((pixel) => 1 - pixel);
      paintPixels();
      updatePixels();
      log("client", "Input intensities inverted");
    }
    async function uploadImage(event) {
      const file = event.target.files[0];
      event.target.value = "";
      if (!file) return;
      const version = ++uploadVersion;
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      ) {
        fail("Choose a PNG, JPEG, or WebP image under 10 MB.");
        return;
      }
      let bitmap;
      try {
        bitmap = await createImageBitmap(file);
        if (version !== uploadVersion) return;
        const small = document.createElement("canvas");
        small.width = small.height = 32;
        const context = small.getContext("2d");
        // White backing gives transparent dark-ink images a usable background.
        context.fillStyle = "white";
        context.fillRect(0, 0, 32, 32);
        const scale = 28 / Math.max(bitmap.width, bitmap.height);
        const width = bitmap.width * scale, height = bitmap.height * scale;
        context.drawImage(
          bitmap,
          (32 - width) / 2,
          (32 - height) / 2,
          width,
          height,
        );
        const data = context.getImageData(0, 0, 32, 32).data;
        let values = Array.from(
          { length: 1024 },
          (_, i) =>
            (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 +
              data[i * 4 + 2] * 0.0722) / 255,
        );
        // Estimate the source background inside the letterbox, not from the white padding.
        const left = Math.floor((32 - width) / 2),
          right = Math.min(31, Math.ceil((32 + width) / 2) - 1);
        const top = Math.floor((32 - height) / 2),
          bottom = Math.min(31, Math.ceil((32 + height) / 2) - 1);
        const edge = [];
        for (let x = left; x <= right; x++) {
          edge.push(values[top * 32 + x], values[bottom * 32 + x]);
        }
        for (let y = top; y <= bottom; y++) {
          edge.push(values[y * 32 + left], values[y * 32 + right]);
        }
        const shouldInvert = edge.reduce((a, b) =>
              a + b, 0) / edge.length > 0.5;
        if (shouldInvert) values = values.map((value) => 1 - value);
        for (let y = 0; y < 32; y++) {
          for (let x = 0; x < 32; x++) {
            if (x < left || x > right || y < top || y > bottom) {
              values[y * 32 + x] = 0;
            }
          }
        }
        s.pixels = values;
        paintPixels();
        updatePixels();
        s.sample = null;
        s.inputName = file.name;
        log(
          "client",
          `Image resized with aspect ratio preserved; ${
            shouldInvert ? "light" : "dark"
          } background detected`,
        );
      } catch {
        if (version === uploadVersion) {
          fail(
            "This image could not be decoded. Try another PNG, JPEG, or WebP.",
          );
        }
      } finally {
        bitmap?.close();
      }
    }
    function preset(name) {
      s.hookDraft = {
        identity: "// Keep each activation unchanged.\nreturn value;",
        relu:
          "// Replace negative C1 activations with zero.\nreturn layer.id === 'C1'\n  ? Math.max(0, value)\n  : value;",
        ablate:
          "// Remove C1's first feature map.\nconst map = Math.floor(index / (layer.width * layer.height));\nreturn layer.id === 'C1' && map === 0 ? 0 : value;",
      }[name];
      s.hookDraftEnabled = name !== "identity";
    }
    function applyHook() {
      s.hookCode = s.hookDraft;
      s.hookEnabled = s.hookDraftEnabled;
      log(
        "client",
        s.hookEnabled
          ? "Activation callback enabled"
          : "Activation callback disabled",
      );
      start(true);
    }
    const fmt = (value, digits = 3) =>
      Number.isFinite(value) ? value.toFixed(digits) : "—";
    onMounted(async () => {
      await nextTick();
      sample(7);
      connect();
    });
    onUnmounted(() => {
      destroyed = true;
      invalidate();
      clearTimeout(reconnectTimer);
      socket?.close();
    });
    return {
      s,
      drawing,
      selectedLayer,
      selectedTensor,
      scores,
      totalTime,
      visibleTerms,
      challenge,
      fmt,
      clearDrawing,
      sample,
      invert,
      uploadImage,
      beginDraw,
      draw,
      endDraw,
      step,
      togglePlay,
      reset,
      selectLayer,
      chooseChannel,
      selectCell,
      selectUnit,
      mapValues,
      preset,
      applyHook,
    };
  },
}).mount("#app");
