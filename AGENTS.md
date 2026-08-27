# AGENTS.md — tian.im

Facts and constraints for agents working in this repository. Read before
changing dependencies, the build, or the deploy pipeline.

## What this is

- Personal blog at **tian.im**, built with **Jekyll** and deployed via
  **GitHub Pages** (custom domain via `CNAME`; Pages workflow uses
  `actions/jekyll-build-pages@v1`).
- Minimalist theme: **riggraz/no-style-please**, loaded as a *remote theme*
  (never as a local gem on Pages).
- Content: dated Markdown posts in `_posts/` (front matter: `title`,
  `layout`, optional `tags`).

## Toolchain (hard requirements)

- **Ruby >= 3.4** is required (the theme's gemspec demands it). The host
  mise Ruby (3.1.2) is too old **and** its gem dir is not writable — always
  work inside Docker (`ruby:3.4`, same as the Dockerfile).
- **Jekyll is pinned `~> 3.10`** on purpose: GitHub Pages bundles exactly
  3.10.0 and the theme supports 3.x. Do **not** bump Jekyll to 4.x in a
  routine dependency upgrade.
- Bundler 2.6.x (lockfile: `BUNDLED WITH 2.6.9`).

### Gemfile essentials

| Gem | Version | Why it's here |
|---|---|---|
| `jekyll` | `~> 3.10` | pinned to GitHub Pages' version |
| `jekyll-remote-theme` | `~> 0.4.3` | makes `remote_theme` work locally; Pages bundles the same version, keep in sync |
| `jekyll-feed` | `0.17.0` | Pages-pinned plugin |
| `jekyll-seo-tag` | `2.8.0` | Pages-pinned plugin |
| `jektex` | `~> 0.1.1` | theme dependency; installed only for local builds — Pages skips it in safe mode |
| `jekyll-sitemap` | `1.4.0` | sitemap.xml |
| `kramdown-parser-gfm`, `webrick`, `csv`, `bigdecimal`, `base64`, `logger` | — | Ruby 3.4 default-gem shims / server bits needed by the 3.10 stack |

## How the theme is loaded

- `_config.yml` uses **`remote_theme: riggraz/no-style-please` only** —
  `theme:` must stay commented (`jekyll-remote-theme` raises if both are
  set).
- **Locally**: the `jekyll-remote-theme` plugin downloads the theme zip
  from GitHub at build time (network required during `jekyll build`) and
  applies it like a gem theme: it builds a mock gemspec whose runtime deps
  (`jekyll-feed`, `jekyll-seo-tag`, `jektex`) get `require`d — hence those
  gems are declared explicitly in the Gemfile.
- **GitHub Pages** (`actions/jekyll-build-pages`): builds with the
  `github-pages` gem in safe mode — `remote_theme` is native, and
  non-whitelisted deps like `jektex` are silently skipped. The action only
  *checks* the Gemfile (emits a warning if unsatisfied) and otherwise
  ignores it for building.

## Commands

```bash
# Dev server (docker): http://localhost:4000, livereload :35729
docker compose up

# Local build check (mirrors the project Dockerfile runtime incl. nodejs)
docker run --rm -v "$PWD":/app -w /app -e JEKYLL_ENV=development ruby:3.4 \
  bash -lc "apt-get update -qq && apt-get install -y -qq nodejs && bundle exec jekyll build"

# Regression tests for the photo-grid/lightbox feature
npm test            # build test/.test-site if stale + static + headless-Chrome tests
npm run test:build  # rebuild test/.test-site in docker (SKIP_BUILD=1 skips it in npm test)

# Dependency upgrade — MUST run under Ruby >= 3.4 (docker), never the host Ruby
docker run --rm -v "$PWD":/app -w /app ruby:3.4 bash -lc "bundle update"
```

## Testing

A lightweight, zero-dependency (`package.json` has no npm deps) regression
suite guards the photo-grid lightbox feature:

- `test/run.mjs` — orchestrator: `node --check`s the site JS, builds
  `test/.test-site` (docker, unless fresh per `test/.build-stamp` or
  `SKIP_BUILD=1`), then runs the phases below.
- **Test builds are isolated from the dev server**: `test/build.sh` builds
  into `test/.test-site` (gitignored), never `_site/` — a running
  `jekyll serve --watch` owns `_site/`, and its regenerations used to race
  with the suite and even leaked `test/` into `_site/` before the exclude
  below existed. CI also builds to `test/.test-site`.
- `test/fixtures.mjs` — lifecycle for the photo-grid test fixture: the 3×3
  demo post lives **only** under `test/fixtures/posts/` and is copied into
  `_posts/` for test builds (`node test/fixtures.mjs copy`), then removed
  again (`clean` — only known fixture filenames are ever deleted, so it is
  safe even when the fixtures are absent). Real builds (dev server, Pages
  deploy) therefore never ship it. `npm test` drives it via `test/build.sh`
  (copy → docker build → trap-clean, with a `run.mjs` exit-hook backstop);
  CI runs `cp test/fixtures/posts/*.md _posts/` before its jekyll build.
  Add/edit fixtures under `test/fixtures/posts/`, never in `_posts/`.
- `test/static.test.mjs` — asserts against the **built `test/.test-site`**
  and treats `test/fixtures/posts/` as first-class (parses both `_posts/`
  and the fixtures): every post with `images:` renders a `.img-grid` with
  the right class and cell count; the 9-image fixture must remain a 3×3
  nine-grid; the dark-mode invert-neutralisation rules live in
  `assets/css/main.css`; and it guards the `close`-shadowing regression in
  `assets/js/gallery.js`.
- `test/browser.test.mjs` — drives the real lightbox in headless Chrome
  (auto-detected, override `CHROME_PATH`) via a hand-rolled CDP client
  (`test/lib/cdp.mjs`; needs Node >= 21 for the global WebSocket, CI uses
  22): open-at-index, prev/next buttons, keyboard wrap-around, close via
  ✕ / backdrop / Esc, single-image nav hiding, dark-mode overlay colour,
  body scroll lock, zero page exceptions.
- CI: `.github/workflows/test.yml` — ruby 3.4 `bundle exec jekyll build` +
  both test phases on every push/PR. It invokes the phases **directly**
  (`node test/static.test.mjs` etc.), so the test files must never require
  docker themselves (docker only appears in `test/build.sh`).
- **Keep `test/fixtures/posts/2026-08-27-image-gallery-demo.md`** — it is
  the 3×3 regression fixture; deleting it fails the suite by design.
- Browser tests deliberately don't depend on the external picsum images
  loading — assertions use the lightbox counter/classes, not image bytes.

## Constraints / gotchas (learned the hard way)

1. **Never set both `theme:` and `remote_theme:`** in `_config.yml`.
2. **No git-sourced gems** (`gem 'x', github: ...`) in the Gemfile —
   `actions/jekyll-build-pages` cannot install them (symptom: "is not yet
   checked out. Run `bundle install` first." + "The no-style-please theme
   could not be found"). The theme must come via `remote_theme`.
3. Keep `jekyll ~> 3.10` and `jekyll-remote-theme ~> 0.4.3` pinned; an
   unpinned `jekyll` silently resolves to 4.4.x which diverges from Pages.
4. `jekyll-feed` / `jekyll-seo-tag` / `jektex` used to arrive transitively
   via the theme *gem*; as a remote theme they must stay in the Gemfile or
   builds fail with missing-dependency errors.
5. `jektex` renders LaTeX via `execjs`, which needs a JS runtime (nodejs) —
   the Dockerfile installs `nodejs` for this; no LaTeX in posts means node
   isn't actually exercised.
6. The official `ruby` image sets `BUNDLE_PATH=/usr/local/bundle`, which
   overrides any local bundler config; `docker-compose.yml` persists gems
   via the named volume `ruby_3_4_bundle_cache`.
7. `Gemfile.lock` **is tracked in git** despite being listed in `.gitignore`
   (historical quirk) — keep committing lockfile updates.
8. The Dockerfile's `CMD ["rails", "server", ...]` is a stale leftover
   (this is not a Rails app); `docker-compose.yml` overrides it with
   `bundle exec jekyll serve ...`. Don't "fix" the Dockerfile by making it
   run rails.
9. The Pages action prints a cosmetic warning —
   "The github-pages gem can't satisfy your Gemfile's dependencies" — any
   time the Gemfile contains gems outside the Pages bundle (e.g.
   `csv`/`bigdecimal`/`webrick`/`jektex`). The build still succeeds; don't
   chase it away.
10. Gitignored build/run artifacts: `_site/`, `*-cache/`, `.sass-cache/`,
    `.bundle/`, `vendor/`, `.jekyll-metadata`.

## Verify after any dependency change

1. Run `bundle update` in a Ruby 3.4 container (see Commands).
2. `bundle exec jekyll build` (docker, with nodejs): expect **no layout
   warnings**, and `feed.xml`, `sitemap.xml`, `assets/css/main.css`
   generated; posts render under pretty permalinks (`/YYYY/MM/DD/slug/`).
3. Grep `Gemfile.lock`: no `GIT` section; `jekyll (3.10.0)`,
   `jekyll-remote-theme (0.4.3)`.
4. Pages path: either replicate the build with the
   `ghcr.io/actions/jekyll-build-pages:v1.0.13` image (needs a real
   `INPUT_TOKEN` — an empty token makes `jekyll-github-metadata` fail with
   401) or push and watch the workflow.

## File map

- `Gemfile`, `Gemfile.lock` — dependencies + lock (see constraints above)
- `_config.yml` — site config: `remote_theme`, `theme_config` (appearance
  etc.), `plugins: [jekyll-feed, jekyll-seo-tag, jekyll-remote-theme]`;
  `exclude:` keeps `test/`, `Gemfile*`, `node_modules`, `vendor/*` out of
  the published site (setting `exclude` *replaces* Jekyll's defaults, so
  they are listed explicitly)
- `assets/css/main.scss` — `@import "no-style-please"` (theme sass) +
  `monokai.css`; also holds the photo-grid + lightbox styles incl. the
  dark-mode invert neutralisation for the lightbox
- `assets/js/gallery.js` — photo-grid lightbox (opened by the global
  `<script defer>` injected in `_layouts/default.html` override)
- `_layouts/default.html` / `_layouts/post.html` / `_includes/post_list.html`
  — **local overrides** of the remote theme that implement the photo-grid
  feature (`data-gallery="auto"` on post articles, grid rendering, global
  gallery.js include). Local files beat the remote theme; keep the theme's
  front-matter blocks intact when editing.
- `index.md` / `posts.md` / `404.md` / `feed.xml` — site pages (layouts
  `home` / `post_list` / `page` come from the theme)
- `docker-compose.yml`, `Dockerfile` — dev runtime (`ruby:3.4` + nodejs)
- `CNAME` — `tian.im`; `_data/menu.yml` — nav menu
- `package.json` — no npm deps; `npm test` is the regression entry point
  (Node >= 21 for the browser tests)
- `test/` — regression suite (see Testing above); `test/build.sh` is the
  only place docker is used by tests; `test/fixtures/posts/` holds the 3×3
  fixture post, copied into `_posts/` only during test builds
- `.github/workflows/test.yml` — CI: ruby 3.4 jekyll build + static and
  browser tests on every push/PR (the Pages deploy itself is a separate
  built-in Pages workflow, not this file)