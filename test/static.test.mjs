// Static regression suite: JS syntax + source guards + generated-site markup.
// Run against the repo root after `jekyll build` (see test/run.mjs / CI).
//
// Posts are sourced from BOTH _posts/ and the test fixtures under
// test/fixtures/posts/ — the 3x3 regression fixture is copied into _posts/
// during test builds (test/fixtures.mjs) but must always be considered part
// of the expected site regardless of whether it is currently materialised.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { suite, assert, assertEq, assertIncludes } from "./lib/harness.mjs";
import { FIXTURES } from "./fixtures.mjs";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
// test builds go to a dedicated destination (test/.test-site) so a running
// `jekyll serve --watch` dev server never races with the suite
const SITE = path.join(ROOT, "test", ".test-site");
const JS = path.join(ROOT, "assets", "js", "gallery.js");
const POSTS_DIR = path.join(ROOT, "_posts");
const FIXTURES_DIR = path.join(ROOT, "test", "fixtures", "posts");

// from "2026-08-27-image-gallery-demo.md" -> "/2026/08/27/image-gallery-demo/"
function postUrl(name) {
  const m = /^(\d{4})-(\d{2})-(\d{2})-([^.]+)\.md$/.exec(name);
  if (!m) throw new Error(`unexpected post filename: ${name}`);
  return `/${m[1]}/${m[2]}/${m[3]}/${m[4]}/`;
}

// count of `images:` entries in a post's front matter (no YAML dep needed)
function imageCount(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!m) return 0;
  const lines = m[1].split("\n");
  const imagesIdx = lines.findIndex((l) => /^images:$/.test(l));
  if (imagesIdx === -1) return 0;
  let n = 0;
  for (let i = imagesIdx + 1; i < lines.length; i++) {
    if (/^\s*-\s+\S/.test(lines[i])) n++;
    else break;
  }
  return n;
}

function collect(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ name: f, url: postUrl(f), images: imageCount(path.join(dir, f)), dir }))
    .filter((p) => p.images > 0);
}

const realPosts = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
const imagePosts = [...collect(POSTS_DIR), ...collect(FIXTURES_DIR)];

assert(fs.existsSync(SITE), `test/.test-site missing — run "npm run test:build" (or jekyll build -d test/.test-site)`);
assert(imagePosts.length > 0, "no posts with `images:` — the photo-grid feature needs at least one (fixture: test/fixtures/posts/2026-08-27-image-gallery-demo.md)");

const demoFixture = imagePosts.find((p) => p.dir === FIXTURES_DIR && p.name === "2026-08-27-image-gallery-demo.md");

function gridClassFor(n) {
  const c = Math.min(n, 9);
  if (c === 1) return "img-grid--one";
  if (c === 2 || c === 4) return "img-grid--two";
  return "img-grid--three";
}

// split an HTML string into <li>…</li> segments
function liSegments(html) {
  const parts = html.split("<li>").slice(1);
  return parts.map((p) => {
    const end = p.indexOf("</li>");
    return p.slice(0, end === -1 ? p.length : end);
  });
}

const { test, run } = suite();

// ---------- JS source level ----------
test("gallery.js passes node --check", () => {
  const r = spawnSync(process.execPath, ["--check", JS], { encoding: "utf8" });
  assertEq(r.status, 0, "node --check failed:\n" + r.stderr);
});

test("gallery.js does not regress the `close` shadowing bug (regression 2026-08-27)", () => {
  const src = fs.readFileSync(JS, "utf8");
  assert(!src.includes("var close = document.createElement"), "found `var close = document.createElement` — this shadows the close() function and breaks the close button");
  assert(src.includes('closeBtn.addEventListener("click", close)'), "missing closeBtn click handler wiring");
  assert(src.includes('key === "Escape"'), "missing Escape handling");
  assert(src.includes("touchstart"), "missing touch swipe support");
});

test("post_list.html guards against `images:` written as a scalar string", () => {
  // a bare string would be iterated char-by-char by Liquid (post.images.size =
  // char count, limit: 9 -> 9 broken cells); post.images.first is truthy only
  // for real arrays, so the grid fails closed for strings (verified in docker:
  // string images render no grid, build stays green)
  const src = fs.readFileSync(path.join(ROOT, "_includes", "post_list.html"), "utf8");
  assert(src.includes("post.images.first"), "the scalar-string guard (post.images.first) was removed from post_list.html");
  assert(src.includes("limit: 9"), "the 9-cell cap must stay in the template");
});

test("gallery.js ships to _site", () => {
  const built = path.join(SITE, "assets", "js", "gallery.js");
  assert(fs.existsSync(built), "assets/js/gallery.js not in _site output");
  assert(fs.readFileSync(built, "utf8").includes("closeBtn.addEventListener"), "_site copy is stale (does not contain the close fix) — rebuild");
});

// ---------- generated markup ----------
test("CSS ships the grid + lightbox rules (incl. dark-mode invert neutralisation)", () => {
  const css = fs.readFileSync(path.join(SITE, "assets", "css", "main.css"), "utf8");
  for (const needle of [".img-grid", "img-grid--one", "img-grid--two", "img-grid--three", ".lb{", ".lb__btn--prev", ".lb__counter", ".lb__close"]) {
    assertIncludes(css, needle, needle + " missing from main.css");
  }
  // dark-mode neutralisation present for both body[a=dark] and body[a=auto]
  assertIncludes(css, 'body[a="dark"] .lb{filter:invert(1)}', "dark-mode .lb invert rule missing");
  assertIncludes(css, 'body[a="dark"] .lb img{filter:invert(0)}', "dark-mode .lb img rule missing");
});

test("posts archive page renders a grid for every post with images (incl. fixtures)", () => {
  const html = fs.readFileSync(path.join(SITE, "posts", "index.html"), "utf8");
  for (const p of imagePosts) {
    const seg = liSegments(html).find((s) => s.includes(`href="${p.url}"`));
    assert(seg, `posts page missing entry for ${p.name} (${p.url}) — was _site built with test fixtures? run "npm test"`);
    const expected = Math.min(p.images, 9);
    assertIncludes(seg, `img-grid ${gridClassFor(p.images)}`, `wrong grid class for ${p.name}`);
    const cells = seg.match(/img-grid__cell/g) || [];
    assertEq(cells.length, expected, `grid cell count for ${p.name}`);
    assertIncludes(seg, "data-gallery", `grid missing data-gallery for ${p.name}`);
    // progressive enhancement: cells must link to the full image
    assertIncludes(seg, 'data-full="', `cells missing data-full for ${p.name}`);
  }
});

test("fixture: the 9-image demo post stays a 3x3 nine-grid", () => {
  assert(demoFixture, "fixture test/fixtures/posts/2026-08-27-image-gallery-demo.md was deleted — re-add it or adjust this test");
  assertEq(demoFixture.images, 9, "9-grid fixture must have 9 images");
  const html = fs.readFileSync(path.join(SITE, "posts", "index.html"), "utf8");
  const seg = liSegments(html).find((s) => s.includes(`href="${demoFixture.url}"`));
  assert(seg, `9-grid fixture not in built posts page — run "npm test" (materialises fixtures, then builds)`);
  const cells = (seg.match(/img-grid__cell/g) || []).length;
  assertEq(cells, 9, "fixture grid must show 9 thumbnails");
});

test("two-column grid is exercised by real markup (2- and 4-image posts)", () => {
  const html = fs.readFileSync(path.join(SITE, "posts", "index.html"), "utf8");
  const twoGrids = liSegments(html).filter((s) => s.includes("img-grid--two"));
  assert(twoGrids.length > 0, "no img-grid--two rendered — need a fixture with 2 or 4 images");
  const two = imagePosts.find((p) => p.name.endsWith("image-grid-two.md"));
  assert(two, "two-column fixture test/fixtures/posts/2026-08-26-image-grid-two.md missing");
  const seg = liSegments(html).find((s) => s.includes(`href="${two.url}"`));
  assertIncludes(seg, "img-grid img-grid--two", "2-image post must use the two-column grid class");
  assertEq((seg.match(/img-grid__cell/g) || []).length, 2, "2-image post must render exactly 2 cells");
  for (const g of twoGrids) {
    const n = (g.match(/img-grid__cell/g) || []).length;
    assert(n === 2 || n === 4, `img-grid--two with ${n} cells (expected 2 or 4)`);
  }
});

test("grids never exceed 9 cells (WeChat cap), 12-image fixture is truncated", () => {
  const html = fs.readFileSync(path.join(SITE, "posts", "index.html"), "utf8");
  for (const seg of liSegments(html)) {
    const n = (seg.match(/img-grid__cell/g) || []).length;
    assert(n <= 9, `a grid rendered ${n} cells — the 9-cell cap was violated`);
  }
  const cap = imagePosts.find((p) => p.name.endsWith("image-grid-cap.md"));
  assert(cap, "cap fixture test/fixtures/posts/2026-08-25-image-grid-cap.md missing");
  const seg = liSegments(html).find((s) => s.includes(`href="${cap.url}"`));
  assert(seg, "cap fixture grid missing from built posts page");
  assertEq((seg.match(/img-grid__cell/g) || []).length, 9, "12-image post must render 9 cells");
});

test("home page (menu list, limit 3) renders a grid for the newest image post", () => {
  const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  // home lists the 3 newest posts overall (menu limit). The fixture is a
  // post during test builds, so consider real _posts AND fixtures.
  const candidates = [...realPosts, ...FIXTURES]
    .map((f) => ({ f, d: f.slice(0, 10) }))
    .sort((a, b) => b.d.localeCompare(a.d))
    .slice(0, 3);
  for (const c of candidates) {
    const p = imagePosts.find((x) => x.name === c.f);
    if (p) {
      assertIncludes(html, p.url, `newest image post ${p.name} missing from home page`);
      assertIncludes(html, "img-grid", `home page shows no thumbnail grid for ${p.name}`);
      return;
    }
  }
  // no image post among the 3 newest — home should then have no grid at all
  assert(!html.includes("img-grid__cell"), "home page has grid cells but no image post is listed");
});

test("every post with images gets a detail page with the auto lightbox hook", () => {
  for (const p of imagePosts) {
    const file = path.join(SITE, p.url, "index.html");
    assert(fs.existsSync(file), `detail page missing for ${p.name}`);
    assertIncludes(fs.readFileSync(file, "utf8"), '<article data-gallery="auto">', `article hook missing on ${p.name}`);
  }
  // the fixture demo post also carries the global gallery script (all pages do via default layout)
  assertIncludes(
    fs.readFileSync(path.join(SITE, demoFixture.url, "index.html"), "utf8"),
    '<script src="/assets/js/gallery.js" defer></script>',
    "gallery.js script tag missing"
  );
});

test("non-image real posts still render a plain entry (no empty grid)", () => {
  const html = fs.readFileSync(path.join(SITE, "posts", "index.html"), "utf8");
  const plain = realPosts.filter((f) => !imagePosts.some((p) => p.dir === POSTS_DIR && p.name === f));
  for (const f of plain) {
    const seg = liSegments(html).find((s) => s.includes(`href="${postUrl(f)}"`));
    assert(seg, `posts page missing entry for ${f}`);
    assert(!seg.includes("img-grid"), `${f} has no images: but a grid was rendered`);
  }
});

const ok = await run("static tests");
process.exitCode = ok ? 0 : 1;