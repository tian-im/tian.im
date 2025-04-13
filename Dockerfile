# Use the official Ruby 3.4 slim image
FROM ruby:3.4

# Configure timezone and install system dependencies
RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y \
  build-essential \
  nodejs \
  npm \
  && npm install -g yarn \
  && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Ruby dependencies
COPY Gemfile ./
RUN bundle install --jobs 4 --retry 3

# Copy application code
COPY . .

# Expose port and define entrypoint
EXPOSE 3000

# Start the main process
CMD ["rails", "server", "-b", "0.0.0.0"]
