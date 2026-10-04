import { onMounted, ref, watch } from "/vue.js";

const gray = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255);

export default {
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
    let zoom = 1, panX = 0, panY = 0, drag = null, raster;
    const dimension = () => props.size + 2 * props.padding;
    function rebuild() {
      const dim = dimension();
      raster = document.createElement("canvas");
      raster.width = raster.height = dim;
      const ctx = raster.getContext("2d"),
        image = ctx.createImageData(dim, dim);
      for (let y = 0; y < dim; y++) {
        for (let x = 0; x < dim; x++) {
          const px = x - props.padding, py = y - props.padding;
          const padded = px < 0 || py < 0 || px >= props.size ||
            py >= props.size;
          const value = props.values?.[py * props.size + px];
          let rgb;
          if (padded) rgb = (x + y) % 2 ? [188, 200, 176] : [205, 214, 196];
          else if (!Number.isFinite(value)) rgb = [232, 236, 228];
          else if (props.signed) {
            const t = Math.min(1, Math.abs(value) / props.scale);
            const end = value < 0 ? [42, 117, 134] : [192, 115, 47];
            rgb = end.map((v) => Math.round(247 + (v - 247) * t));
          } else rgb = [gray(value), gray(value), gray(value)];
          const i = (y * dim + x) * 4;
          image.data[i] = rgb[0];
          image.data[i + 1] = rgb[1];
          image.data[i + 2] = rgb[2];
          image.data[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      draw();
    }
    function draw() {
      if (!canvas.value || !raster) return;
      const ctx = canvas.value.getContext("2d"),
        dim = dimension(),
        cell = 640 / dim;
      ctx.fillStyle = "#e8ece4";
      ctx.fillRect(0, 0, 640, 640);
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);
      ctx.imageSmoothingEnabled = false;
      if (props.revealed >= props.size ** 2) {
        ctx.drawImage(raster, 0, 0, 640, 640);
      } else {
        const rows = Math.floor(props.revealed / props.size),
          cols = props.revealed % props.size;
        if (rows) {
          ctx.drawImage(raster, 0, 0, dim, rows, 0, 0, 640, rows * cell);
        }
        if (cols) {
          ctx.drawImage(
            raster,
            0,
            rows,
            cols,
            1,
            0,
            rows * cell,
            cols * cell,
            cell,
          );
        }
      }
      // Draw labels and grid lines only for cells visible at the current zoom.
      if (cell * zoom >= 18) {
        const left = Math.max(0, Math.floor(-panX / zoom / cell));
        const top = Math.max(0, Math.floor(-panY / zoom / cell));
        const right = Math.min(dim, Math.ceil((640 - panX) / zoom / cell));
        const bottom = Math.min(dim, Math.ceil((640 - panY) / zoom / cell));
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const px = x - props.padding,
              py = y - props.padding,
              index = py * props.size + px;
            const padded = px < 0 || py < 0 || px >= props.size ||
              py >= props.size;
            const value = props.values?.[index];
            ctx.strokeStyle = "#88888860";
            ctx.lineWidth = 0.6 / zoom;
            ctx.strokeRect(x * cell, y * cell, cell, cell);
            if (
              cell * zoom > 43 && !padded && index < props.revealed &&
              Number.isFinite(value)
            ) {
              ctx.fillStyle = props.signed || value > 0.5
                ? "#1b2925"
                : "#eeeeee";
              ctx.font = `${Math.min(22 / zoom, cell * 0.24)}px monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(
                String(Number(value.toFixed(3))),
                (x + 0.5) * cell,
                (y + 0.5) * cell,
                cell * 0.9,
              );
            }
          }
        }
      }
      if (props.overlay) {
        const { x, y, size, term } = props.overlay;
        ctx.fillStyle = "#d5ed922a";
        ctx.fillRect(x * cell, y * cell, size * cell, size * cell);
        ctx.strokeStyle = "#d5ed92";
        ctx.lineWidth = 1 / zoom;
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            ctx.strokeRect((x + col) * cell, (y + row) * cell, cell, cell);
          }
        }
        ctx.lineWidth = 2 / zoom;
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
        ctx.lineWidth = 2 / zoom;
        ctx.strokeStyle = "#7aa437";
        ctx.strokeRect(x * cell, y * cell, cell, cell);
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
          Math.min(64, zoom * Math.exp(-event.deltaY * 0.002)),
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
    onMounted(rebuild);
    watch(
      () => [
        props.values,
        props.size,
        props.padding,
        props.signed,
        props.scale,
      ],
      rebuild,
    );
    watch(() => [props.overlay, props.selected, props.revealed], draw);
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
