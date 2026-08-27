// Browser regression suite: drives the real lightbox in headless Chrome via CDP.
// Needs: a built _site (run test/build.sh first) and Chrome/Chromium
// (auto-detected; override with CHROME_PATH). Set SHOTS=1 to save screenshots
// into test/.artifacts/ for debugging.
import fs from "node:fs";
import path from "node:path";
import { suite, assert, assertEq } from "./lib/harness.mjs";
import { launchChrome, newPage, connect, sleep, findChrome } from "./lib/cdp.mjs";
import { serve } from "./lib/server.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
// tests build into test/.test-site (isolated from a maybe-running dev server
// that owns _site)
const SITE = path.join(ROOT, "test", ".test-site");
const ARTIFACTS = path.join(ROOT, "test", ".artifacts");

// fixtures (the demo post doubles as the 3x3 regression fixture)
const DEMO_HREF = "/2026/08/27/image-gallery-demo/";

const { test, run } = suite();

if (!findChrome()) {
  console.log(`\n== browser tests ==\n  SKIPPED: no Chrome/Chromium found (set CHROME_PATH). These run in CI.`);
  process.exit(0);
}

assert(fs.existsSync(SITE), `_site missing — run "npm run test:build" first`);

const server = await serve(SITE);
const chrome = await launchChrome();
const tab = await newPage(chrome.port);
const page = await connect(tab.webSocketDebuggerUrl);

async function maybeShot(name) {
  if (!process.env.SHOTS) return;
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ARTIFACTS, `${name}.png`), Buffer.from(r.data, "base64"));
  console.log(`    screenshot -> test/.artifacts/${name}.png`);
}

// click the index-th thumbnail of the grid inside the <li> of a given post href
async function clickCell(href, index) {
  // an open lightbox covers the whole viewport — close it first
  if (await page.ev(`!!document.querySelector('.lb') && document.querySelector('.lb').classList.contains('is-open')`)) {
    await page.key("Escape");
    await sleep(300);
  }
  const pos = JSON.parse(await page.ev(`JSON.stringify((() => {
    const a = document.querySelector('a[href=${JSON.stringify(href)}]');
    if (!a) return { n: -1, x: 0, y: 0 };
    const cells = a.closest('li').querySelectorAll('.img-grid__cell');
    if (!cells[${index}]) return { n: cells.length, x: 0, y: 0 };
    cells[${index}].scrollIntoView({ block: 'center' });
    const r = cells[${index}].getBoundingClientRect();
    return { n: cells.length, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })())`));
  assertEq(pos.n, 9, `demo grid must have 9 cells (fixture: ${DEMO_HREF})`);
  await page.click(pos.x, pos.y);
  await sleep(450);
}

async function lb() {
  return JSON.parse(await page.ev(`JSON.stringify((() => {
    const lb = document.querySelector('.lb');
    if (!lb) return { open: false, counter: "", src: "", prev: "", next: "", bg: "", scrollLock: "" };
    const img = document.querySelector('.lb__img');
    return {
      open: lb.classList.contains('is-open'),
      counter: document.querySelector('.lb__counter').textContent,
      src: img ? img.src : '',
      prev: getComputedStyle(document.querySelector('.lb__btn--prev')).visibility,
      next: getComputedStyle(document.querySelector('.lb__btn--next')).visibility,
      bg: getComputedStyle(document.querySelector('.lb')).backgroundColor,
      scrollLock: document.body.style.overflow,
    };
  })())`));
}

async function closeLb() {
  if (await page.ev(`!!document.querySelector('.lb') && document.querySelector('.lb').classList.contains('is-open')`)) {
    await page.key("Escape");
    await sleep(300);
  }
}

await page.navigate(`${server.url}/posts/`, "light");

test("posts page renders the 3x3 nine-grid fixture (9 cells, 3 columns)", async () => {
  await page.navigate(`${server.url}/posts/`, "light");
  const info = JSON.parse(await page.ev(`JSON.stringify({
    grids: document.querySelectorAll('[data-gallery]').length,
    cells3: document.querySelectorAll('.img-grid--three .img-grid__cell').length,
    cols3: getComputedStyle(document.querySelector('.img-grid--three')).gridTemplateColumns.split(' ').length,
    script: !!document.querySelector('script[src*="gallery.js"]'),
  })`));
  assert(info.grids >= 2, "expected >= 2 grids on the posts page");
  assertEq(info.cells3, 9, "nine-grid must have 9 cells");
  assertEq(info.cols3, 3, "nine-grid must be 3 columns");
  assert(info.script, "gallery.js not loaded");
});

test("clicking the 5th thumbnail opens at 5/9 with correct image + nav buttons", async () => {
  await page.navigate(`${server.url}/posts/`, "light");
  await clickCell(DEMO_HREF, 4);
  const s = await lb();
  assert(s.open, "lightbox did not open");
  assertEq(s.counter, "5 / 9", "counter");
  assert(s.src.includes("/grid-5/"), "shown image is the 5th");
  assertEq(s.prev, "visible", "prev button");
  assertEq(s.next, "visible", "next button");
  await maybeShot("lightbox-light");
});

test("next/prev buttons navigate", async () => {
  if (!(await lb()).open) {
    await clickCell(DEMO_HREF, 4);
  }
  const next = await page.center(".lb__btn--next");
  await page.click(next.x, next.y);
  await sleep(300);
  assertEq((await lb()).counter, "6 / 9", "next -> 6/9");
  const prev = await page.center(".lb__btn--prev");
  await page.click(prev.x, prev.y);
  await sleep(300);
  assertEq((await lb()).counter, "5 / 9", "prev -> 5/9");
});

test("keyboard arrows navigate with wrap-around", async () => {
  await clickCell(DEMO_HREF, 8); // 9/9
  assertEq((await lb()).counter, "9 / 9", "open at last image");
  await page.key("ArrowRight");
  await sleep(250);
  assertEq((await lb()).counter, "1 / 9", "next from last wraps to first");
  await page.key("ArrowLeft");
  await sleep(250);
  assertEq((await lb()).counter, "9 / 9", "prev from first wraps to last");
  await closeLb();
});

test("close via the ✕ button (regression 2026-08-27)", async () => {
  await clickCell(DEMO_HREF, 2);
  assert((await lb()).open, "lightbox open");
  const btn = await page.center(".lb__close");
  await page.click(btn.x, btn.y);
  await sleep(350);
  assert(!(await lb()).open, "clicking ✕ must close the lightbox");
});

test("close via backdrop click and via Escape", async () => {
  await clickCell(DEMO_HREF, 0);
  assert((await lb()).open, "lightbox open");
  await page.click(6, 6); // empty backdrop corner
  await sleep(350);
  assert(!(await lb()).open, "backdrop click must close");

  await clickCell(DEMO_HREF, 0);
  await page.key("Escape");
  await sleep(350);
  assert(!(await lb()).open, "Escape must close");
});

test("body scroll is locked while open and restored on close", async () => {
  await clickCell(DEMO_HREF, 0);
  assertEq((await lb()).scrollLock, "hidden", "scroll lock while open");
  await closeLb();
  assertEq((await lb()).scrollLock, "", "scroll restored after close");
});

test("single-image grid hides the nav buttons", async () => {
  await page.navigate(`${server.url}/posts/`, "light");
  const one = JSON.parse(await page.ev(`JSON.stringify((() => {
    const cell = document.querySelector('.img-grid--one .img-grid__cell');
    if (!cell) return { n: 0 };
    cell.scrollIntoView({ block: 'center' });
    const r = cell.getBoundingClientRect();
    return { n: document.querySelectorAll('.img-grid--one .img-grid__cell').length, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })())`));
  if (one.n === 0) {
    console.log("    (skipped: no single-image grid in this build)");
    return;
  }
  await page.click(one.x, one.y);
  await sleep(450);
  const s = await lb();
  assert(s.open, "single-image lightbox open");
  assertEq(s.counter, "1 / 1", "single-image counter");
  assertEq(s.prev, "hidden", "prev hidden for single image");
  assertEq(s.next, "hidden", "next hidden for single image");
  await closeLb();
});

test("detail page: post images open a lightbox in dark mode with correct overlay", async () => {
  await page.navigate(`${server.url}${DEMO_HREF}`, "dark");
  const bodyAttr = await page.ev(`document.body.getAttribute('a')`);
  assertEq(bodyAttr, "auto", "body appearance attr");
  const first = await page.center(`article[data-gallery="auto"] img`);
  assert(first, "post page has an image to click");
  await page.click(first.x, first.y);
  await sleep(450);
  const s = await lb();
  assert(s.open, "detail-page lightbox open");
  assertEq(s.counter, "1 / 2", "detail gallery holds the two demo images");
  assertEq(s.bg, "rgba(0, 0, 0, 0.88)", "dark-mode overlay must render as styled (invert neutralised)");
  await page.key("ArrowLeft");
  await sleep(250);
  assertEq((await lb()).counter, "2 / 2", "ArrowLeft in dark mode wraps to last");
  await maybeShot("lightbox-dark");
  await closeLb();
});

test("no uncaught page exceptions during the whole session", () => {
  assertEq(page.exceptions.length, 0, "page threw: " + page.exceptions.join(" | "));
});

await closeLb();
const ok = await run("browser tests");
page.close();
chrome.close();
server.close();
process.exitCode = ok ? 0 : 1;