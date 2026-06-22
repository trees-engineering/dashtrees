#!/usr/bin/env bash
# ============================================================================
# deploy_vercel.sh — deploy a standalone prospect demo .html to Vercel,
# non-interactively, so Claude can run it without prompts.
#
#   ./deploy_vercel.sh <demo.html> [project-name]
#
# Auth: needs a Vercel token, looked up in this order:
#   1. $VERCEL_TOKEN environment variable
#   2. ~/.config/trees/vercel-token   (a file containing just the token)
# Create one at https://vercel.com/account/tokens (scope: your account).
#
# It copies the html to a temp project dir as index.html, then runs the
# official CLI via npx (no global install needed) and prints the live URL.
# ============================================================================
set -euo pipefail

HTML="${1:-}"
PROJECT="${2:-}"

if [[ -z "$HTML" || ! -f "$HTML" ]]; then
  echo "✗ Usage: ./deploy_vercel.sh <demo.html> [project-name]" >&2
  exit 1
fi

# --- resolve token ---------------------------------------------------------
TOKEN="${VERCEL_TOKEN:-}"
if [[ -z "$TOKEN" && -f "$HOME/.config/trees/vercel-token" ]]; then
  TOKEN="$(tr -d '[:space:]' < "$HOME/.config/trees/vercel-token")"
fi
if [[ -z "$TOKEN" ]]; then
  echo "✗ No Vercel token found." >&2
  echo "  Set VERCEL_TOKEN, or save one to ~/.config/trees/vercel-token" >&2
  echo "  Create a token at https://vercel.com/account/tokens" >&2
  exit 1
fi

# --- derive a clean project name -------------------------------------------
if [[ -z "$PROJECT" ]]; then
  base="$(basename "$HTML" .html)"          # e.g. Demo_Enviros
  PROJECT="$base"
fi
# vercel project names: lowercase, alphanumeric + dashes
SLUG="$(echo "$PROJECT" | tr '[:upper:] _' '[:lower:]--' | sed 's/[^a-z0-9-]//g; s/-\{2,\}/-/g; s/^-//; s/-$//')"
[[ -z "$SLUG" ]] && SLUG="prospect-demo"

# --- stage a PERSISTENT deploy dir (per project) ---------------------------
# Using a stable dir keeps Vercel's .vercel/project.json link, so every redeploy
# of <slug> targets the SAME project/URL instead of creating "-2 / -five" forks.
WORK="$HOME/.config/trees/deploys/$SLUG"
mkdir -p "$WORK"
cp "$HTML" "$WORK/index.html"
printf '{\n  "cleanUrls": true\n}\n' > "$WORK/vercel.json"

echo "→ Deploying '$SLUG' to Vercel…"
cd "$WORK"

# Scope (team) — required in non-interactive mode when the token sees a team.
# Order: $VERCEL_SCOPE env, then cached ~/.config/trees/vercel-scope.
SCOPE="${VERCEL_SCOPE:-}"
if [[ -z "$SCOPE" && -f "$HOME/.config/trees/vercel-scope" ]]; then
  SCOPE="$(tr -d '[:space:]' < "$HOME/.config/trees/vercel-scope")"
fi

# Deterministically bind this dir to a project named "$SLUG" (creates it if new,
# links to the existing one otherwise) — done once, then persisted via .vercel/.
if [[ ! -f "$WORK/.vercel/project.json" ]]; then
  npx --yes vercel@latest link --yes --project "$SLUG" \
    ${SCOPE:+--scope "$SCOPE"} --token "$TOKEN" >/dev/null 2>&1 || true
fi

# Helper: run a deploy, optionally with a scope. Never let set -e kill us — we
# inspect the output ourselves.
run_deploy(){
  local scope="$1"
  if [[ -n "$scope" ]]; then
    npx --yes vercel@latest deploy --prod --yes --scope "$scope" --token "$TOKEN" 2>&1 || true
  else
    npx --yes vercel@latest deploy --prod --yes --token "$TOKEN" 2>&1 || true
  fi
}

RAW="$(run_deploy "$SCOPE")"

# If the token belongs to a team, Vercel returns missing_scope + the team name.
# Parse it, retry once, and cache it for next time.
if printf '%s' "$RAW" | grep -q '"reason": "missing_scope"'; then
  SCOPE="$(printf '%s\n' "$RAW" | grep -oE '"name": *"[^"]+"' | head -n1 | sed -E 's/.*"name": *"([^"]+)".*/\1/')"
  if [[ -n "$SCOPE" ]]; then
    mkdir -p "$HOME/.config/trees"; printf '%s' "$SCOPE" > "$HOME/.config/trees/vercel-scope"
    echo "  (using team: $SCOPE)"
    RAW="$(run_deploy "$SCOPE")"
  fi
fi

DEPLOY_URL="$(printf '%s\n' "$RAW" | grep -oE 'https://[a-z0-9.-]+\.vercel\.app' | tail -n1)"
if [[ -z "$DEPLOY_URL" ]]; then
  echo "⚠ Deploy finished but no URL was captured. Output:" >&2
  printf '%s\n' "$RAW" | tail -n 20 >&2
  exit 1
fi

# The clean public domain is <project>.vercel.app; the raw deployment URL is
# often behind deployment-protection auth. Prefer the clean one if it's live.
CLEAN="https://$SLUG.vercel.app"
if [[ "$(curl -s -o /dev/null -w '%{http_code}' -L "$CLEAN")" == "200" ]]; then
  echo "✓ Live: $CLEAN"
else
  echo "✓ Live: $DEPLOY_URL"
fi
