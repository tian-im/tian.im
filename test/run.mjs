// Test orchestrator: `npm test` (or `node test/run.mjs`).
//  1. syntax-check the site JS
//  2. build _site (docker jekyll build) unless fresh / SKIP_BUILD=1 —
//     test/build.sh materialises the fixtures into _posts/ for the build
//     and cleans them up afterwards
//  3. run static (build-output markup) tests
//  4. run browser (headless Chrome) tests — skipped if no Chrome
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cleanFixtures } from "./fixtures.mjs";

const ROOT = process.cwd();
const JS_FILES = ["assets/js/gallery.js"];
const WATCH = ["_layouts", "_includes", "_posts", "_data", "assets", "test/fixtures"];
const STAMP = path.join("test", ".build-stamp");
const SITE_DIR = path.join("test", ".test-site");

let failures = 0;
const step = (name, fn) => {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${e.message || e}`);
  }
};

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`command failed (exit ${r.status}): ${cmd} ${args.join(" ")}`);
  return r;
}

// hash of every source file (path + mtime) that affects the built site.
// A hash — not bare mtimes — so that file additions/removals (e.g. a post
// deleted from _posts/) invalidate _site, while the fixtures copy/clean
// cycle in test/build.sh stays invisible (it leaves _posts untouched at
// the end and fixtures are hashed via test/fixtures).
function treeHash() {
  const h = crypto.createHash("sha256");
  const entries = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else entries.push(`${r}:${fs.statSync(p).mtimeMs}`);
    }
  };
  for (const d of WATCH) if (fs.existsSync(d)) walk(d, d);
  entries.push(`_config.yml:${fs.statSync("_config.yml").mtimeMs}`);
  entries.sort();
  h.update(entries.join("\n"));
  return h.digest("hex");
}

function needsBuild() {
  if (process.env.SKIP_BUILD === "1") return { needed: false, why: "SKIP_BUILD=1" };
  if (!fs.existsSync(SITE_DIR)) return { needed: true, why: "test/.test-site missing" };
  const cur = treeHash();
  const prev = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, "utf8").trim() : "";
  return { needed: cur !== prev, why: prev ? "source tree changed since last build" : "no build stamp yet" };
}

// preflight: Node version (browser tests need the global WebSocket of Node >= 21)
if (Number(process.versions.node.split(".")[0]) < 21) {
  console.log(`WARN  node ${process.versions.node} < 21 — browser tests need the global WebSocket; upgrade or use Node 22+`);
}

// backstop: if a build was interrupted and left fixture copies in _posts/
// (e.g. SIGKILL before build.sh's trap ran), remove them on the way out —
// cleanFixtures only ever deletes known fixture filenames, so it is safe
// even on a machine where the fixtures are absent.
process.on("exit", cleanFixtures);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

try {
  step("JS syntax check", () => {
    for (const f of JS_FILES) {
      const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(r.stderr || `node --check failed on ${f}`);
    }
  });

  const build = needsBuild();
  if (build.needed) {
    console.log(`\nBuilding test/.test-site (${build.why}) …`);
    sh("bash", ["test/build.sh"]);
    fs.writeFileSync(STAMP, treeHash());
    console.log("Build done.\n");
  } else {
    console.log(`\nSkipping build (test/.test-site up to date).\n`);
  }

  step("static tests", () => {
    const r = spawnSync(process.execPath, ["test/static.test.mjs"], { encoding: "utf8", stdio: "inherit" });
    if (r.status !== 0) throw new Error(`static tests exited ${r.status}`);
  });

  step("browser tests", () => {
    const r = spawnSync(process.execPath, ["test/browser.test.mjs"], { encoding: "utf8", stdio: "inherit" });
    if (r.status !== 0) throw new Error(`browser tests exited ${r.status}`);
  });
} finally {
  cleanFixtures();
}

console.log(failures === 0 ? "\nAll tests passed." : `\n${failures} step(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;