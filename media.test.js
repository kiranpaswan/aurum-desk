import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("a friend can read a chart saved on the shared desk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hochsternn-"));
  process.env.DESK_DATA = dir;
  const { startServer } = await import("./server.mjs");
  const server = await startServer(0);
  const port = server.address().port;
  const base = "http://127.0.0.1:" + port;
  try {
    const health = await fetch(base + "/api/health");
    assert.equal(health.status, 200);

    const uploaded = await fetch(base + "/api/media", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: PNG,
    });
    const saved = await uploaded.json();
    assert.equal(uploaded.status, 200);
    assert.match(saved.url, /^\/api\/media\/c.+\.png$/);

    const trade = {
      id: "t-friend",
      title: "Gold continuation",
      symbol: "XAUUSD",
      direction: "long",
      image: saved.url,
      discussion: "Neckline held.",
      decision: "priority",
      updatedAt: Date.now(),
    };
    const posted = await fetch(base + "/api/probboard.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades: [trade] }),
    });
    assert.equal(posted.status, 200);

    const friend = await fetch(base + "/api/probboard.php");
    const board = await friend.json();
    assert.equal(board.trades[0].image, saved.url);
    assert.equal(board.trades[0].title, "Gold continuation");

    const chart = await fetch(base + board.trades[0].image);
    assert.equal(chart.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await chart.arrayBuffer()), PNG);

    const junk = await fetch(base + "/api/media", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not an image",
    });
    const junkBody = await junk.json();
    assert.equal(junk.status, 415);
    assert.match(junkBody.error, /PNG/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    delete process.env.DESK_DATA;
  }
});
