// Photo-grid test fixture lifecycle.
//
// The 3x3 regression fixture (2026-08-27-image-gallery-demo.md) lives ONLY
// under test/fixtures/posts/ so that real builds — the dev server
// (`docker compose up`) and the GitHub Pages deploy — never ship it.
// Test builds copy it into _posts/ first and clean it up afterwards:
//
//   node test/fixtures.mjs copy   # copy fixtures into _posts/ (idempotent)
//   node test/fixtures.mjs clean  # remove exactly the fixture files again
//
// `npm test` and test/build.sh do both automatically; CI copies before its
// jekyll build step (ephemeral VM, no cleanup needed).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const FIXTURES_DIR = path.join(ROOT, "test", "fixtures", "posts");
const POSTS_DIR = path.join(ROOT, "_posts");

export const FIXTURES = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

export function copyFixtures() {
  const copied = [];
  for (const f of FIXTURES) {
    fs.copyFileSync(path.join(FIXTURES_DIR, f), path.join(POSTS_DIR, f));
    copied.push(f);
  }
  return copied;
}

export function cleanFixtures() {
  // safety: only ever delete files whose name matches a known fixture,
  // never a user-authored post
  const removed = [];
  for (const f of FIXTURES) {
    const p = path.join(POSTS_DIR, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removed.push(f);
    }
  }
  return removed;
}

const cmd = process.argv[2];
if (cmd === "copy") {
  const copied = copyFixtures();
  console.log(`fixtures -> _posts/: ${copied.join(", ") || "(none)"}`);
} else if (cmd === "clean") {
  const removed = cleanFixtures();
  console.log(`fixtures cleaned from _posts/: ${removed.join(", ") || "(none)"}`);
} else if (cmd) {
  console.error(`unknown command: ${cmd} (expected "copy" or "clean")`);
  process.exit(1);
}