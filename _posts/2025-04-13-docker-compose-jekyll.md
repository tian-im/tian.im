---
title: Docker-compose Jekyll
layout: post
tags:
  - programming
---

* Initialize repo

  ```shell
  git init
  ```

* Add `Gemfile`

  ```ruby
  source 'https://rubygems.org'

  gem 'jekyll'

  group :jekyll_plugins do
    gem 'jekyll-sitemap'
    gem 'jekyll-paginate'
  end
  ```

* Add `docker-compose.yml`

  ```yml
  services:
    web:
      image: ruby:3.4
      ports:
        - "4000:4000"
        - "35729:35729"  # LiveReload port
      volumes:
        - .:/app
        - ruby_3_4_bundle_cache:/usr/local/bundle
      working_dir: /app
      environment:
        - BUNDLE_PATH=/usr/local/bundle
        - JEKYLL_ENV=development
      command: bash -c "bundle install && bundle exec jekyll serve --host 0.0.0.0 --watch --incremental"

  volumes:
    ruby_3_4_bundle_cache:
  ```

* Start the app

  ```shell
  docker-compose up
  ```
