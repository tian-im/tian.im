source 'https://rubygems.org'

# This will help ensure the proper Jekyll version is running.
# Pinned to the major version GitHub Pages uses (the no-style-please
# remote theme is built for Jekyll 3.x).
gem 'jekyll', '~> 3.10'

gem 'kramdown-parser-gfm'
gem 'webrick'
gem 'csv'
gem 'bigdecimal'
gem 'base64'
gem 'logger'

group :jekyll_plugins do
  gem 'jekyll-sitemap'
  # The no-style-please theme gem used to pull these in; with the theme
  # loaded via remote_theme they must be declared explicitly. Versions
  # match what GitHub Pages bundles.
  gem 'jekyll-feed', '0.17.0'
  gem 'jekyll-seo-tag', '2.8.0'
  gem 'jektex', '~> 0.1.1' # theme dependency; skipped by Pages' safe-mode build
  # Enables the remote_theme from _config.yml on local/dev builds too
  # (GitHub Pages already bundles jekyll-remote-theme 0.4.3; keep in sync).
  gem 'jekyll-remote-theme', '~> 0.4.3'
end
