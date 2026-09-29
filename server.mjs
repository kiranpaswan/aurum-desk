import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const store = createStore(process.env.DESK_DATA || path.join(root, "data"));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req, limit = 9 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("That chart is too large to share."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const key = req.method + " " + url.pathname;
  try {
    if (key === "GET /api/health") return sendJson(res, 200, { ok: true, shared: true });
    if (key === "GET /api/impactsl.php") return sendJson(res, 200, (await store.get("impact")) || {});
    if (key === "POST /api/impactsl.php") {
      await store.set("impact", JSON.parse((await readBody(req)).toString("utf8") || "{}"));
      return sendJson(res, 200, { ok: true });
    }
    if (key === "GET /api/probability.php") return sendJson(res, 200, (await store.get("probability")) || {});
    if (key === "POST /api/probability.php") {
      await store.set("probability", JSON.parse((await readBody(req)).toString("utf8") || "{}"));
      return sendJson(res, 200, { ok: true });
    }
    if (key === "GET /api/board.php") return sendJson(res, 200, (await store.get("board")) || {});
    if (key === "POST /api/board.php") {
      await store.set("board", JSON.parse((await readBody(req)).toString("utf8") || "{}"));
      return sendJson(res, 200, { ok: true });
    }
    if (key === "GET /api/probboard.php") return sendJson(res, 200, (await store.get("probboard")) || { trades: [] });
    if (key === "POST /api/probboard.php") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const trades = Array.isArray(body.trades) ? body.trades : [];
      await store.set("probboard", {
        trades: trades.map((trade) => {
          const next = { ...trade };
          delete next._uploading;
          if (typeof next.image === "string" && next.image.startsWith("data:")) delete next.image;
          return next;
        }),
      });
      return sendJson(res, 200, { ok: true });
    }
    if (key === "GET /api/strategies.php") return sendJson(res, 200, (await store.get("strategies")) || []);
    if (key === "POST /api/strategies.php") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      return sendJson(res, 200, await store.addStrategy(body.name));
    }
    if (key === "DELETE /api/strategies.php") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      return sendJson(res, 200, await store.removeStrategy(body.id));
    }
    if (key === "GET /api/journal.php") return sendJson(res, 200, (await store.get("journal")) || []);
    if (key === "POST /api/journal.php") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      return sendJson(res, 200, await store.addJournal(body));
    }
    if (key === "DELETE /api/journal.php") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      return sendJson(res, 200, await store.removeJournal(body.id));
    }
    if (req.method === "POST" && url.pathname === "/api/media") {
      const saved = await store.saveMedia(await readBody(req));
      return sendJson(res, 200, saved);
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/media/")) {
      const found = await store.readMedia(path.basename(url.pathname));
      if (!found) {
        sendJson(res, 404, { error: "That chart is not on the shared desk." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": found.mime,
        "Content-Length": found.buffer.length,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.end(found.buffer);
      return;
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, error.status || 400, { error: error.message || "Could not save." });
  }
}

function serveStatic(req, res, url) {
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.normalize(path.join(root, requested));
  if (!file.startsWith(root) || file.startsWith(path.join(root, "data"))) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  access(file)
    .then(() => stat(file))
    .then((info) => {
      if (!info.isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      createReadStream(file).pipe(res);
    })
    .catch(() => {
      res.writeHead(404).end("Not found");
    });
}

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      handleApi(req, res, url);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end("Method not allowed");
      return;
    }
    serveStatic(req, res, url);
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

const launchedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  const port = Number(process.env.PORT || 4173);
  startServer(port).then((server) => {
    const address = server.address();
    console.log("Hochsternn Desk http://127.0.0.1:" + address.port);
  });
}
