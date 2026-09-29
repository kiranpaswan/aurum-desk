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

    const book = {
      target: 10000,
      trades: [{ id: "t1", date: "2026-09-29", symbol: "XAUUSD", pnl: 250, note: "shared" }],
      balance: 12500,
      updatedAt: 50,
      baseUpdatedAt: 0,
    };
    const bookPost = await fetch(base + "/api/book.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(book),
    });
    assert.equal(bookPost.status, 200);
    const friendBook = await (await fetch(base + "/api/book.php")).json();
    assert.equal(friendBook.trades[0].pnl, 250);
    assert.equal(friendBook.trades[0].symbol, "XAUUSD");
    assert.equal(friendBook.balance, 12500);
    assert.equal(friendBook.baseUpdatedAt, undefined);

    const stale = await fetch(base + "/api/book.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...book, trades: [], balance: 1, updatedAt: 40, baseUpdatedAt: 0 }),
    });
    assert.equal(stale.status, 409);
    const afterStale = await (await fetch(base + "/api/book.php")).json();
    assert.equal(afterStale.trades[0].pnl, 250);
    assert.equal(afterStale.balance, 12500);

    const newer = await fetch(base + "/api/book.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...book,
        balance: 13000,
        updatedAt: 80,
        baseUpdatedAt: 50,
      }),
    });
    assert.equal(newer.status, 200);
    const afterNewer = await (await fetch(base + "/api/book.php")).json();
    assert.equal(afterNewer.balance, 13000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    delete process.env.DESK_DATA;
  }
});
