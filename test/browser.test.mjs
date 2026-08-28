// Browser regression suite: drives the real lightbox in headless Chrome via CDP.
// Needs: a built test/.test-site (run test/build.sh first) and Chrome/Chromium
// (auto-detected; override with CHROME_PATH). Set SHOTS=1 to save screenshots
// into test/.artifacts/ for debugging.
//
// Timing: assertions poll for their expected state (waitFor) instead of fixed
// sleeps, so an overloaded runner doesn't flake.
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

// fixtures (each doubles as a regression fixture)
const DEMO_HREF = "/2026/08/27/image-gallery-demo/"; // 9 images  -> 3x3
const TWO_HREF = "/2026/08/26/image-grid-two/";      // 2 images  -> 2 columns
const CAP_HREF = "/2026/08/25/image-grid-cap/";      // 12 images -> capped at 9

const { test, run } = suite();

if (!findChrome()) {
  console.log(`\n== browser tests ==\n  SKIPPED: no Chrome/Chromium found (set CHROME_PATH). These run in CI.`);
  process.exit(0);
}

assert(fs.existsSync(SITE), `test/.test-site missing — run "npm run test:build" first`);

const server = await serve(SITE);
const chrome = await launchChrome();
const tab = await newPage(chrome.port);
const page = await connect(tab.webSocketDebuggerUrl);

// poll `predicateExpr` (a JS expression, evaluated in the page) until truthy
async function waitFor(predicateExpr, desc, { timeout = 6000, interval = 40 } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await page.ev(predicateExpr);
    if (last) return last;
    await sleep(interval);
  }
  throw new Error(`waitFor timed out (${desc}); last value: ${JSON.stringify(last)}`);
}

async function maybeShot(name) {
  if (!process.env.SHOTS) return;
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const r = await page.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ARTIFACTS, `${name}.png`), Buffer.from(r.data, "base64"));
  console.log(`    screenshot -> test/.artifacts/${name}.png`);
}

// click the index-th thumbnail of the grid inside the <li> of a given post href
async function clickDemoCell(href, index) {
  // an open lightbox covers the whole viewport — close it first
  if (await page.ev(`!!document.querySelector('.lb') && document.querySelector('.lb').classList.contains('is-open')`)) {
    await page.key("Escape");
    await waitFor(`!document.querySelector('.lb').classList.contains('is-open')`, "lightbox closes after Escape");
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
  await waitFor(`document.querySelector('.lb').classList.contains('is-open')`, "lightbox opens after thumbnail click");
}

async function lb() {
  return JSON.parse(await page.ev(`JSON.stringify((() => {
    const lb = document.querySelector('.lb');
    if (!lb) return { open: false, counter: "", src: "", alt: "", prev: "", next: "", filter: "", imgFilter: "", scrollLock: "" };
    const img = document.querySelector('.lb__img');
    return {
      open: lb.classList.contains('is-open'),
      counter: document.querySelector('.lb__counter').textContent,
      src: img ? img.src : "",
      alt: img ? img.getAttribute("alt") : "",
      prev: getComputedStyle(document.querySelector('.lb__btn--prev')).visibility,
      next: getComputedStyle(document.querySelector('.lb__btn--next')).visibility,
      filter: getComputedStyle(document.querySelector('.lb')).filter,
      imgFilter: getComputedStyle(document.querySelector('.lb__img')).filter,
      scrollLock: document.body.style.overflow,
    };
  })())`));
}

async function closeLb() {
  if (await page.ev(`!!document.querySelector('.lb') && document.querySelector('.lb').classList.contains('is-open')`)) {
    await page.key("Escape");
    await waitFor(`!document.querySelector('.lb').classList.contains('is-open')`, "lightbox closes");
  }
}

// returns an expression that is true while the counter reads `text`
const counterIs = (text) => `document.querySelector('.lb__counter').textContent === ${JSON.stringify(text)}`;

await page.navigate(`${server.url}/posts/`, "light");

test("posts page renders the demo 3x3 nine-grid (9 cells, 3 columns, gallery wiring)", async () => {
  await page.navigate(`${server.url}/posts/`, "light");
  const info = JSON.parse(await page.ev(`JSON.stringify((() => {
    const a = document.querySelector('a[href=${JSON.stringify(DEMO_HREF)}]');
    const g = a.closest('li').querySelector('.img-grid');
    return {
      grids: document.querySelectorAll('[data-gallery]').length,
      cells: g.querySelectorAll('.img-grid__cell').length,
      cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
      script: !!document.querySelector('script[src*="gallery.js"]'),
    };
  })())`));
  assert(info.grids >= 4, "expected >= 4 thumbnail grids on the posts page (sunset + 3 fixtures)");
  assertEq(info.cells, 9, "demo grid must have 9 cells");
  assertEq(info.cols, 3, "demo grid must be 3 columns");
  assert(info.script, "gallery.js not loaded");
});

test("two-column grid and the 9-cell cap hold in real markup", async () => {
  await page.navigate(`${server.url}/posts/`, "light");
  const info = JSON.parse(await page.ev(`JSON.stringify((() => {
    const take = (href) => {
      const a = document.querySelector('a[href=' + JSON.stringify(href) + ']');
      const g = a.closest('li').querySelector('.img-grid');
      return g ? { cells: g.querySelectorAll('.img-grid__cell').length, cols: getComputedStyle(g).gridTemplateColumns.split(' ').length } : null;
    };
    return { two: take(${JSON.stringify(TWO_HREF)}), cap: take(${JSON.stringify(CAP_HREF)}) };
  })())`));
  assert(info.two, "two-column fixture grid not found");
  assertEq(info.two.cells, 2, "2-image grid must have 2 cells");
  assertEq(info.two.cols, 2, "2-image grid must be 2 columns");
  assert(info.cap, "cap fixture grid not found");
  assertEq(info.cap.cells, 9, "12-image grid must be capped at 9 cells");
});

test("clicking the 5th thumbnail opens at 5/9 (light mode, no filter flip)", async () => {
  await page.navigate(`${server.url}/posts/`, "light");
  await clickDemoCell(DEMO_HREF, 4);
  const s = await lb();
  assert(s.open, "lightbox did not open");
  assertEq(s.counter, "5 / 9", "counter");
  assert(s.src.includes("/grid-5/"), "shown image is the 5th");
  assertEq(s.prev, "visible", "prev button");
  assertEq(s.next, "visible", "next button");
  assertEq(s.filter, "none", "light mode must not flip the overlay");
  await maybeShot("lightbox-light");
});

test("next/prev buttons navigate", async () => {
  if (!(await lb()).open) {
    await clickDemoCell(DEMO_HREF, 4);
  }
  const next = await page.center(".lb__btn--next");
  await page.click(next.x, next.y);
  await waitFor(counterIs("6 / 9"), "counter -> 6 / 9 after next");
  const prev = await page.center(".lb__btn--prev");
  await page.click(prev.x, prev.y);
  await waitFor(counterIs("5 / 9"), "counter -> 5 / 9 after prev");
});

test("keyboard arrows navigate with wrap-around", async () => {
  await clickDemoCell(DEMO_HREF, 8); // 9/9
  assertEq((await lb()).counter, "9 / 9", "open at last image");
  await page.key("ArrowRight");
  await waitFor(counterIs("1 / 9"), "next from last wraps to first");
  await page.key("ArrowLeft");
  await waitFor(counterIs("9 / 9"), "prev from first wraps to last");
  // modifier-arrows must NOT step the lightbox (they stay browser shortcuts)
  await page.key("ArrowLeft", 2); // Ctrl = 2
  await sleep(200);
  assertEq((await lb()).counter, "9 / 9", "Ctrl+ArrowLeft must not step the lightbox");
  await page.key("ArrowRight", 1); // Alt = 1
  await sleep(200);
  assertEq((await lb()).counter, "9 / 9", "Alt+ArrowRight must not step the lightbox");
  await closeLb();
});

test("close via the ✕ button (regression 2026-08-27)", async () => {
  await clickDemoCell(DEMO_HREF, 2);
  assert((await lb()).open, "lightbox open");
  const btn = await page.center(".lb__close");
  await page.click(btn.x, btn.y);
  await waitFor(`!document.querySelector('.lb').classList.contains('is-open')`, "lightbox closes via ✕");
});

test("close via backdrop click and via Escape", async () => {
  await clickDemoCell(DEMO_HREF, 0);
  assert((await lb()).open, "lightbox open");
  await page.click(6, 6); // empty backdrop corner
  await waitFor(`!document.querySelector('.lb').classList.contains('is-open')`, "lightbox closes via backdrop");
  assert(!(await lb()).open, "backdrop click must close");

  await clickDemoCell(DEMO_HREF, 0);
  await page.key("Escape");
  await waitFor(`!document.querySelector('.lb').classList.contains('is-open')`, "lightbox closes via Escape");
});

test("body scroll is locked while open and restored on close", async () => {
  await clickDemoCell(DEMO_HREF, 0);
  await waitFor(`document.body.style.overflow === 'hidden'`, "scroll lock while open");
  await closeLb();
  await waitFor(`document.body.style.overflow === ''`, "scroll restored after close");
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
  await waitFor(`document.querySelector('.lb').classList.contains('is-open')`, "single-image lightbox opens");
  const s = await lb();
  assert(s.open, "single-image lightbox open");
  assertEq(s.counter, "1 / 1", "single-image counter");
  assertEq(s.prev, "hidden", "prev hidden for single image");
  assertEq(s.next, "hidden", "next hidden for single image");
  await closeLb();
});

test("a11y: focus moves into the lightbox, Tab is trapped, focus is restored", async () => {
  await page.navigate(`${server.url}/posts/`, "light");
  // focus the thumb we are about to click so restore has a deterministic target
  await page.ev(`document.querySelectorAll('.img-grid--three .img-grid__cell')[2].focus()`);
  await clickDemoCell(DEMO_HREF, 2);
  await waitFor(`document.activeElement === document.querySelector('.lb__close')`, "focus moves to the close button on open");
  assertEq(await page.ev(`document.querySelector('.lb__counter').getAttribute('aria-live')`), "polite", "counter must announce changes");
  assertEq(await page.ev(`document.querySelector('.lb__img').getAttribute('draggable')`), "false", "lightbox image must not be drag-selectable");
  assert((await lb()).alt.includes("image 3"), `lightbox image alt should carry the thumbnail alt: "${(await lb()).alt}"`);

  // Tab from the LAST control must wrap to the FIRST
  await page.ev(`document.querySelector('.lb__close').focus()`);
  await page.key("Tab");
  await waitFor(`document.activeElement === document.querySelector('.lb__btn--prev')`, "Tab from last control wraps to first (inside .lb)");
  // Shift+Tab from the FIRST control must wrap to the LAST (modifiers: Shift = 8)
  await page.ev(`document.querySelector('.lb__btn--prev').focus()`);
  await page.key("Tab", 8);
  await waitFor(`document.activeElement === document.querySelector('.lb__close')`, "Shift+Tab from first control wraps to last (inside .lb)");
  await closeLb();
  await waitFor(`document.activeElement.classList.contains('img-grid__cell')`, "focus returns to the opening thumbnail on close");
});

test("detail page: post images open a lightbox in dark mode with invert neutralised", async () => {
  await page.navigate(`${server.url}${DEMO_HREF}`, "dark");
  const bodyAttr = await page.ev(`document.body.getAttribute('a')`);
  assertEq(bodyAttr, "auto", "body appearance attr");
  const first = await page.center(`article[data-gallery="auto"] img`);
  assert(first, "post page has an image to click");
  await page.click(first.x, first.y);
  await waitFor(`document.querySelector('.lb').classList.contains('is-open')`, "detail-page lightbox opens");
  const s = await lb();
  assert(s.open, "detail-page lightbox open");
  assertEq(s.counter, "1 / 2", "detail gallery holds the two demo images");
  // the theme inverts the whole body in dark mode; the overlay must be
  // flipped ONCE (filter) to render as styled, and its img filter must cancel
  // the theme's img invert — these are behavioural, not just presence checks
  assertEq(s.filter, "invert(1)", "dark-mode overlay must flip once to neutralise the body invert");
  assertEq(s.imgFilter, "invert(0)", "dark-mode lightbox image must cancel the theme img invert");
  await page.key("ArrowLeft");
  await waitFor(counterIs("2 / 2"), "ArrowLeft in dark mode wraps to last");
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