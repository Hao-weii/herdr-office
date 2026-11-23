#!/usr/bin/env bash
# Installs the office mod and links the team skill on macOS and Linux (install.ps1 on Windows).
#   ./install.sh                         copy the mod into Herdr, link the herdr-team skill
#   ./install.sh --statusline            also configure Claude Code's status line
#   ./install.sh --sidebar               also add an "辦公室" toggle to the right sidebar
#   ./install.sh --dry-run --statusline  preview only; no files are changed
#   --force                              replace a different status line
# Works with the bash 3.2 that macOS ships.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dry=0 statusline=0 sidebar=0 force=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    --statusline) statusline=1 ;;
    --sidebar) sidebar=1 ;;
    --force) force=1 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (see ./install.sh --help)" >&2; exit 2 ;;
  esac
done

fail() { echo "$1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail 'Node.js 20 or newer is required. Install Node.js LTS and open a new terminal.'
node_version="$(node --version)"
node_major="${node_version#v}"; node_major="${node_major%%.*}"
case "$node_major" in ''|*[!0-9]*) fail "Could not read the Node.js version: $node_version" ;; esac
[ "$node_major" -ge 20 ] || fail "Node.js 20 or newer is required (found $node_version). Upgrade Node.js and open a new terminal."
herdr="$(command -v herdr-app 2>/dev/null || true)"
[ -n "$herdr" ] || fail 'herdr-app was not found on PATH. Install Herdr Desktop, put its herdr-app command on PATH, and open a new terminal.'
echo "[check] Node.js $node_version; Herdr: $herdr"

force_flag=""; [ "$force" = 1 ] && force_flag="--force"
dry_flag=""; [ "$dry" = 1 ] && dry_flag="--dry-run"

# Preview first, so a broken settings.json stops the install before anything is copied.
if [ "$statusline" = 1 ]; then
  node "$root/scripts/setup-statusline.mjs" --home "$HOME" --dry-run $force_flag || fail 'Status line setup failed; settings were not changed.'
fi

echo '[mod] mirror mods/office into the Herdr app'
if [ "$dry" = 0 ]; then
  node "$root/scripts/sync.mjs" || fail 'Mod synchronization failed; installation stopped.'
fi

skill="$root/skills/herdr-team"
link_skill() {
  local tool="$1" dir="$2" link="$2/herdr-team" current
  if [ -L "$link" ]; then
    current="$(readlink "$link")"
    if [ "$current" = "$skill" ]; then
      echo "[$tool] ok      herdr-team"
      return
    fi
    echo "[$tool] relink  herdr-team (was -> $current)"
    [ "$dry" = 1 ] || rm "$link"
  elif [ -e "$link" ]; then
    fail "$link is a real folder; move it away first"
  else
    echo "[$tool] link    herdr-team"
  fi
  if [ "$dry" = 0 ]; then
    mkdir -p "$dir"
    ln -s "$skill" "$link"
  fi
}
link_skill claude "$HOME/.claude/skills"
link_skill codex "$HOME/.codex/skills"
link_skill antigravity "$HOME/.gemini/config/skills"

if [ "$statusline" = 1 ] && [ "$dry" = 0 ]; then
  node "$root/scripts/setup-statusline.mjs" --home "$HOME" $force_flag || fail 'Status line setup failed; settings were not changed.'
fi
if [ "$sidebar" = 1 ]; then
  node "$root/scripts/sidebar.mjs" $dry_flag || fail 'Sidebar setup failed.'
fi
if [ "$dry" = 1 ]; then echo; echo 'Dry run only, nothing changed.'; fi
