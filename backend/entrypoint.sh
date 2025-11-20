#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${REPO_DIR:-}" ]]; then
  mkdir -p "$REPO_DIR"
fi

sync_cursor_config() {
  local source_dir="/workspace/.cursor"
  local target_dir="/root/.cursor"
  if [[ -d "$source_dir" ]]; then
    mkdir -p "$target_dir"
    cp -a "$source_dir/." "$target_dir/" 2>/dev/null || true
  fi
}

cleanup_lock() {
  if [[ -f "$REPO_DIR/.git/index.lock" ]]; then
    echo "[entrypoint] Stale git index.lock detected; removing..."
    rm -f "$REPO_DIR/.git/index.lock"
  fi
}

clone_repo() {
  if [[ -n "$(ls -A "$REPO_DIR")" ]]; then
    echo "[entrypoint] ${REPO_DIR} contains placeholder files; clearing before clone..."
    find "$REPO_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
  echo "[entrypoint] Cloning repository into ${REPO_DIR}..."
  local clone_url="$TARGET_REPO_URL"
  if [[ -n "${GITHUB_TOKEN:-}" && "$TARGET_REPO_URL" == https://github.com/* ]]; then
    clone_url="https://x-access-token:${GITHUB_TOKEN}@${TARGET_REPO_URL#https://}"
  fi
  git clone "$clone_url" "$REPO_DIR"
  # Keep the authenticated URL for push operations
  # Don't reset to non-authenticated URL
}

if [[ -n "${TARGET_REPO_URL:-}" && -n "${REPO_DIR:-}" ]]; then
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    clone_repo
  else
    echo "[entrypoint] Repo already present; verifying remote and pulling latest ${BASE_BRANCH:-main}..."
    cleanup_lock
    
    # Build authenticated URL if GitHub token is available
    remote_url="$TARGET_REPO_URL"
    if [[ -n "${GITHUB_TOKEN:-}" && "$TARGET_REPO_URL" == https://github.com/* ]]; then
      remote_url="https://x-access-token:${GITHUB_TOKEN}@${TARGET_REPO_URL#https://}"
    fi
    
    existing_remote="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
    if [[ -z "$existing_remote" ]]; then
      git -C "$REPO_DIR" remote add origin "$remote_url"
    else
      # Always update to use authenticated URL
      git -C "$REPO_DIR" remote set-url origin "$remote_url"
    fi
    if ! git -C "$REPO_DIR" fetch origin; then
      echo "[entrypoint] Fetch failed; recloning repository..."
      rm -rf "$REPO_DIR"
      mkdir -p "$REPO_DIR"
      clone_repo
      cleanup_lock
    else
      BRANCH="${BASE_BRANCH:-main}"
      if git -C "$REPO_DIR" rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
        git -C "$REPO_DIR" checkout "$BRANCH"
      else
        git -C "$REPO_DIR" checkout -b "$BRANCH"
      fi
      git -C "$REPO_DIR" pull --ff-only origin "$BRANCH" || true
    fi
  fi
fi

if [[ -n "${REPO_DIR:-}" ]]; then
  if [[ -n "${GIT_COMMITTER_NAME:-}" ]]; then
    git -C "$REPO_DIR" config user.name "$GIT_COMMITTER_NAME" 2>/dev/null || true
  fi
  if [[ -n "${GIT_COMMITTER_EMAIL:-}" ]]; then
    git -C "$REPO_DIR" config user.email "$GIT_COMMITTER_EMAIL" 2>/dev/null || true
  fi
fi

sync_cursor_config

if command -v codex >/dev/null 2>&1; then
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    if ! codex login status >/dev/null 2>&1; then
      echo "[entrypoint] Logging into Codex CLI using OPENAI_API_KEY..."
      printf "%s" "$OPENAI_API_KEY" | codex login --with-api-key >/dev/null 2>&1 || {
        echo "[entrypoint] Codex login failed; Codex commands may error until you login manually."
      }
    fi

    # Only register Playwright MCP for scanner (worker doesn't need browser automation)
    if [[ "$*" == *"scanner"* ]]; then
      if ! codex mcp list 2>/dev/null | grep -q "playwright"; then
        echo "[entrypoint] Registering Playwright MCP server with Codex..."
        codex mcp add \
          --env PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
          --env NODE_OPTIONS="--enable-source-maps" \
          playwright \
          npx -y @playwright/mcp --browser firefox >/dev/null 2>&1 || {
          echo "[entrypoint] Failed to register Playwright MCP server."
        }
      fi
    fi
  else
    echo "[entrypoint] Warning: OPENAI_API_KEY is not set; Codex commands will fail."
  fi
fi

exec "$@"

