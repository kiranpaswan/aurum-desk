import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY = {
  impact: {},
  probability: null,
  strategies: [],
  journal: [],
  board: null,
  probboard: { trades: [] },
  book: null,
};

function id(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function sniffImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
  return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF87a") return "image/gif";
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return "";
}

export function extensionFor(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "";
}

export function createStore(dir) {
  const file = path.join(dir, "desk.json");
  const mediaDir = path.join(dir, "media");
  let chain = Promise.resolve();

  function locked(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  async function read() {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8"));
      return { ...EMPTY, ...parsed, probboard: { trades: [], ...(parsed.probboard || {}) } };
    } catch (error) {
      if (error && error.code === "ENOENT") return structuredClone(EMPTY);
      throw error;
    }
  }

  async function write(state) {
    await mkdir(dir, { recursive: true });
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(state));
    await rename(tmp, file);
  }

  return {
    get(key) {
      return locked(async () => (await read())[key]);
    },
    set(key, value) {
      return locked(async () => {
        const state = await read();
        state[key] = value;
        await write(state);
        return { ok: true };
      });
    },
    replaceBook(next, baseUpdatedAt) {
      return locked(async () => {
        const state = await read();
        const current = state.book;
        const currentAt = current && current.updatedAt ? current.updatedAt : 0;
        const base = Number(baseUpdatedAt) || 0;
        if (currentAt !== base) return { ok: false, conflict: true, book: current || {} };
        const stored = { ...next };
        delete stored.baseUpdatedAt;
        state.book = stored;
        await write(state);
        return { ok: true, book: stored };
      });
    },
    addStrategy(name) {
      return locked(async () => {
        const state = await read();
        const row = { id: id("s"), name: String(name || "").slice(0, 60) };
        state.strategies.push(row);
        await write(state);
        return row;
      });
    },
    removeStrategy(strategyId) {
      return locked(async () => {
        const state = await read();
        state.strategies = state.strategies.filter((row) => row.id !== strategyId);
        await write(state);
        return { ok: true };
      });
    },
    addJournal(entry) {
      return locked(async () => {
        const state = await read();
        const row = { ...entry, id: id("j") };
        state.journal.unshift(row);
        await write(state);
        return row;
      });
    },
    removeJournal(entryId) {
      return locked(async () => {
        const state = await read();
        state.journal = state.journal.filter((row) => row.id !== entryId);
        await write(state);
        return { ok: true };
      });
    },
    saveMedia(buffer) {
      return locked(async () => {
        const mime = sniffImage(buffer);
        const ext = extensionFor(mime);
        if (!ext) {
          const error = new Error("Use a PNG, JPG, GIF, or WebP screenshot.");
          error.status = 415;
          throw error;
        }
        if (buffer.length > 8 * 1024 * 1024) {
          const error = new Error("That chart is too large to share.");
          error.status = 413;
          throw error;
        }
        await mkdir(mediaDir, { recursive: true });
        const name = id("c") + "." + ext;
        const tmp = path.join(mediaDir, name + ".tmp");
        await writeFile(tmp, buffer);
        await rename(tmp, path.join(mediaDir, name));
        return { url: "/api/media/" + name, mime };
      });
    },
    readMedia(name) {
      return locked(async () => {
        if (!/^[a-z0-9]+\.(jpg|png|gif|webp)$/i.test(name)) return null;
        try {
          const buffer = await readFile(path.join(mediaDir, name));
          return { buffer, mime: sniffImage(buffer) || "application/octet-stream" };
        } catch (error) {
          if (error && error.code === "ENOENT") return null;
          throw error;
        }
      });
    },
  };
}
