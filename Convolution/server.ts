import { convolve } from "./public/math.js";

const publicRoot = new URL("./public/", import.meta.url);
const files: Record<string, [string, string]> = {
  "/convolution/": ["index.html", "text/html"],
  "/convolution/app.js": ["app.js", "text/javascript"],
  "/convolution/math.js": ["math.js", "text/javascript"],
  "/convolution/styles.css": ["styles.css", "text/css"],
  "/convolution/kernel-worker.js": ["kernel-worker.js", "text/javascript"],
};

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/convolution/ws") {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) {
      return new Response("Origin not allowed", { status: 403 });
    }
    const { socket, response } = Deno.upgradeWebSocket(request);
    socket.onopen = () => socket.send(JSON.stringify({ type: "hello" }));
    socket.onmessage = (event) => {
      let requestId: unknown;
      try {
        if (typeof event.data !== "string" || event.data.length > 150_000) {
          throw new Error("Expected JSON text under 150 KB.");
        }
        const message = JSON.parse(event.data);
        if (!message || typeof message !== "object" || Array.isArray(message)) {
          throw new Error("Expected a request object.");
        }
        requestId = message.requestId;
        if (message.type !== "compute" || !Number.isSafeInteger(requestId)) {
          throw new Error(
            "Expected a compute request with an integer requestId.",
          );
        }
        const start = performance.now();
        const result = convolve(message.config);
        const elapsed = performance.now() - start;
        socket.send(
          JSON.stringify({ type: "result", requestId, ...result, elapsed }),
        );
        console.info(
          `[convolution] ${message.config.size}×${message.config.size} · ${message.config.kernelSize}×${message.config.kernelSize} kernel · stride ${message.config.stride} · padding ${message.config.padding} → ${result.size}×${result.size} (${
            elapsed.toFixed(1)
          } ms)`,
        );
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Computation failed.";
        socket.send(JSON.stringify({ type: "error", requestId, message }));
        console.warn(`[convolution] ${message}`);
      }
    };
    socket.onerror = () => console.warn("[convolution] WebSocket error");
    return response;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (url.pathname === "/convolution") {
    return new Response(null, {
      status: 308,
      headers: { location: "/convolution/" },
    });
  }
  const entry = files[url.pathname];
  if (!entry) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": `${entry[1]}; charset=utf-8`,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (entry[0] === "kernel-worker.js") {
    headers["content-security-policy"] =
      "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'";
  }
  try {
    const body = await Deno.readFile(new URL(entry[0], publicRoot));
    return new Response(request.method === "HEAD" ? null : body, { headers });
  } catch (error) {
    console.error("[convolution] Could not read asset", error);
    return new Response("Asset unavailable", { status: 500 });
  }
}
