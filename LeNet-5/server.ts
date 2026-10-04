import vuePackage from "vue/package.json" with { type: "json" };
import { createRequire } from "node:module";
import { LAYERS } from "./model.ts";
import { Session } from "./protocol.ts";
import { handler as convolutionHandler } from "../Convolution/server.ts";

const require = createRequire(import.meta.url);
const vueFile = require.resolve("vue/dist/vue.esm-browser.prod.js");
const publicRoot = new URL("./public/", import.meta.url);
const files: Record<string, [string, string]> = {
  "/": ["index.html", "text/html"],
  "/app.js": ["app.js", "text/javascript"],
  "/styles.css": ["styles.css", "text/css"],
  "/hook-worker.js": ["hook-worker.js", "text/javascript"],
};

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.pathname === "/convolution" || url.pathname.startsWith("/convolution/")
  ) {
    return convolutionHandler(request);
  }
  if (url.pathname === "/ws") {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) {
      return new Response("Origin not allowed", { status: 403 });
    }
    const { socket, response } = Deno.upgradeWebSocket(request);
    const session = new Session();
    socket.onopen = () => {
      console.info("[server] Browser connected");
      socket.send(
        JSON.stringify({
          type: "hello",
          layers: LAYERS,
          seed: session.model.seed,
          trained: false,
        }),
      );
    };
    socket.onmessage = (event) => {
      let message: Record<string, unknown> = {};
      try {
        if (typeof event.data !== "string" || event.data.length > 250_000) {
          throw new Error("Message must be JSON text under 250 KB.");
        }
        const parsed = JSON.parse(event.data);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Expected a message object.");
        }
        message = parsed;
        const result = session.handle(message);
        socket.send(JSON.stringify(result));
        if (result.type === "layer") {
          console.info(
            `[server] ${LAYERS[result.index as number].id} computed in ${
              Number(result.elapsed).toFixed(1)
            } ms`,
          );
        }
      } catch (error) {
        const detail = error instanceof Error
          ? error.message
          : "Request failed";
        console.warn(`[server] ${detail}`);
        socket.send(
          JSON.stringify({
            type: "error",
            runId: message.runId,
            message: detail,
          }),
        );
      }
    };
    socket.onclose = () => console.info("[server] Browser disconnected");
    socket.onerror = () => console.warn("[server] WebSocket connection error");
    return response;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (url.pathname === "/health") {
    return Response.json({
      status: "ok",
      model: "LeNet-5 teaching variant",
      trained: false,
    });
  }
  if (url.pathname === "/favicon.ico") {
    return new Response(null, { status: 204 });
  }
  const entry = files[url.pathname];
  if (!entry && url.pathname !== "/vue.js") {
    return new Response("Not found", { status: 404 });
  }
  const file = url.pathname === "/vue.js"
    ? vueFile
    : new URL(entry[0], publicRoot);
  const headers: Record<string, string> = {
    "content-type": `${
      url.pathname === "/vue.js" ? "text/javascript" : entry[1]
    }; charset=utf-8`,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  // Workers can evaluate the user's hook but cannot make network requests or import scripts.
  if (url.pathname === "/hook-worker.js") {
    headers["content-security-policy"] =
      "default-src 'none'; script-src 'unsafe-eval'; connect-src 'none'";
  }
  try {
    const body = await Deno.readFile(file);
    return new Response(request.method === "HEAD" ? null : body, { headers });
  } catch (error) {
    console.error("[server] Could not read asset", error);
    return new Response("Asset unavailable", { status: 500 });
  }
}

if (import.meta.main) {
  const requestedPort = Deno.env.get("PORT");
  const port = Number(requestedPort ?? 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be between 1 and 65535.");
  }
  for (let offset = 0; offset < 10; offset++) {
    try {
      Deno.serve({
        hostname: "127.0.0.1",
        port: port + offset,
        onListen: ({ port: listeningPort }) => {
          console.info(
            `\nLeNet-5 lab → http://localhost:${listeningPort}\nConvolution lab → http://localhost:${listeningPort}/convolution/\nVue ${vuePackage.version} · deterministic untrained weights · seed 1998\n`,
          );
        },
      }, handler);
      break;
    } catch (error) {
      if (
        requestedPort !== undefined ||
        !(error instanceof Deno.errors.AddrInUse) || offset === 9
      ) throw error;
    }
  }
}
