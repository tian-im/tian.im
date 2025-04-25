---
title: Docker-compose Rails
layout: post
tags:
  - programming
---

* Initialize repo.

  ```shell
  git init
  ```

* Add `docker-compose.yml`.

   ```yml
  services:
    builder:
      image: ruby:3.4
      volumes:
        - .:/rails
      working_dir: /rails
      environment:
        - BUNDLE_PATH=/usr/local/bundle
        - RAILS_ENV=development
      # Replace my_app
      command: bash -c "gem install rails -v 8.0.2 && rails new . -n my_app --database=postgresql --force"
   ```

* Run the builder.

  ```shell
  docker-compose run builder
  ```

* Add `Dockerfile.dev` for development.

  ```dockerfile
  FROM ruby:3.4

  # Rails app lives here
  WORKDIR /rails

  # Install base packages
  RUN apt-get update -qq && \
      apt-get install --no-install-recommends -y curl libjemalloc2 libvips postgresql-client && \
      rm -rf /var/lib/apt/lists /var/cache/apt/archives

  # Install packages needed to build gems
  RUN apt-get update -qq && \
      apt-get install --no-install-recommends -y build-essential git libpq-dev libyaml-dev pkg-config && \
      rm -rf /var/lib/apt/lists /var/cache/apt/archives
  ```

* Remove the `builder` section and add services `web` and `db`.

  ```yml
  services:
    web:
      build:
        dockerfile: ./Dockerfile.dev
      command: bash -c "rm -f tmp/pids/server.pid && rails server -b 0.0.0.0"
      environment:
        - HISTFILE=.bash_history
        # Replace my_app_
        - DATABASE_URL=postgres://postgres:password@db:5432/my_app_${RAILS_ENV:-development}
        - RAILS_ENV=${RAILS_ENV:-development}
      volumes:
        - .:/rails
        - bundle_cache:/usr/local/bundle
        - node_modules:/rails/node_modules
      ports:
        - "3000:3000"
      depends_on:
        - db
      stdin_open: true
      tty: true

    db:
      image: postgres:16
      environment:
        POSTGRES_PASSWORD: password
        POSTGRES_USER: postgres
        # Replace my_app_
        POSTGRES_DB: my_app_${RAILS_ENV:-development}
      volumes:
        - postgres_data:/var/lib/postgresql/data
      ports:
        - "5432:5432"

  volumes:
    postgres_data:
    bundle_cache:
    node_modules:
  ```

* Spin up the services.

  ```shell
  docker-compose up
  ```
