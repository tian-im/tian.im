// Minimal Chrome DevTools Protocol client (no npm deps).
// Uses Node's global fetch + WebSocket, so it needs Node >= 21.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else if (process.platform === "linux") {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium-stable"
    );
  }
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

export async function launchChrome() {
  const exe = findChrome();
  if (!exe) throw new Error(`Chrome not found — install Chrome/Chromium or set CHROME_PATH (found candidates on ${process.platform})`);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tianim-test-"));
  const proc = spawn(
    exe,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--user-data-dir=" + userDataDir,
      "--remote-debugging-port=0", // Chrome picks a free port, reported in DevToolsActivePort
      "--window-size=900,1400",
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  // wait until Chrome writes its DevTools port file
  const portFile = path.join(userDataDir, "DevToolsActivePort");
  const deadline = Date.now() + 15000;
  let port = null;
  while (Date.now() < deadline && !port) {
    try {
      const head = fs.readFileSync(portFile, "utf8").split("\n")[0].trim();
      if (head) port = parseInt(head, 10);
    } catch { /* not written yet */ }
    if (!port) await sleep(100);
  }
  if (!port) {
    proc.kill();
    throw new Error("Chrome did not open a DevTools port");
  }
  return {
    port,
    close() {
      try { proc.kill(); } catch { /* already dead */ }
    },
  };
}

export async function newPage(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!res.ok) throw new Error("could not open a Chrome tab");
  return res.json();
}

export async function connect(wsUrl) {
  if (typeof WebSocket === "undefined") {
    throw new Error("Global WebSocket is missing — this suite needs Node >= 21 (pipelines use Node 22)");
  }
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    } else if (m.method === "Runtime.exceptionThrown" && m.params?.exceptionDetails) {
      exceptions.push(m.params.exceptionDetails.text || "page exception");
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("WebSocket connect failed"));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send("Runtime.enable");
  await send("Page.enable");

  return {
    send,
    exceptions,
    close: () => ws.close(),
    // evaluate an expression in the page and return its value
    async ev(expression) {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true });
      if (r.exceptionDetails) throw new Error("in-page eval failed: " + JSON.stringify(r.exceptionDetails));
      return r.result.value;
    },
    async click(x, y) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    },
    async key(k, modifiers = 0) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, modifiers });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, modifiers });
    },
    // center coordinates of the first element matching a CSS selector
    async center(selector) {
      return JSON.parse(
        await this.ev(`JSON.stringify((() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        })())`)
      );
    },
    async navigate(url, scheme = "light") {
      await this.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: scheme }],
      });
      await this.send("Page.navigate", { url });
      await sleep(2500);
    },
  };
}