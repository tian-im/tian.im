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

# Dependency upgrade — MUST run under Ruby >= 3.4 (docker), never the host Ruby
docker run --rm -v "$PWD":/app -w /app ruby:3.4 bash -lc "bundle update"
```

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
  etc.), `plugins: [jekyll-feed, jekyll-seo-tag, jekyll-remote-theme]`
- `assets/css/main.scss` — `@import "no-style-please"` (theme sass) +
  `monokai.css`
- `index.md` / `posts.md` / `404.md` / `feed.xml` — site pages (layouts
  `home` / `post_list` / `page` come from the theme)
- `docker-compose.yml`, `Dockerfile` — dev runtime (`ruby:3.4` + nodejs)
- `CNAME` — `tian.im`; `_data/menu.yml` — nav menu