#!/usr/bin/env bash
# Install ScreenPolish on Linux from the files delivered beside this script.
#
#   ./install.sh                 pick a package, ask where it goes, install it
#   ./install.sh --dir ~/apps    install there without asking
#   ./install.sh --appimage      take the AppImage even on Arch
#   ./install.sh --fix-deps      also install what is missing (asks first)
#   ./install.sh --uninstall     remove what this script installed
#
# Recordings are never touched: uninstalling leaves ~/Videos/ScreenPolish alone.
set -euo pipefail

SELF_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DATA_HOME=${XDG_DATA_HOME:-$HOME/.local/share}
BIN_DIR=${SCREENPOLISH_BIN_DIR:-$HOME/.local/bin}
DESKTOP_FILE=$DATA_HOME/applications/screenpolish.desktop
ICON_DIR=$DATA_HOME/icons/hicolor
DEFAULT_DIR=$HOME/.local/opt
# Written into every desktop entry this script creates. Uninstall removes only
# entries carrying it, so a launcher someone wrote by hand is left alone.
MARKER=X-ScreenPolish-Installer=1

from=$SELF_DIR
dir=""
force_appimage=false
assume_yes=false
uninstall=false
fix_deps=false

while [ $# -gt 0 ]; do
  case $1 in
    --from) from=$2; shift 2 ;;
    --dir) dir=$2; shift 2 ;;
    --appimage) force_appimage=true; shift ;;
    --yes|-y) assume_yes=true; shift ;;
    --uninstall) uninstall=true; shift ;;
    --fix-deps) fix_deps=true; shift ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m  ! %s\033[0m\n' "$*"; }
ok() { printf '\033[32m  ✓ %s\033[0m\n' "$*"; }

ask() {
  # ask <prompt> <default>; honours --yes by taking the default.
  local prompt=$1 default=$2 reply
  if $assume_yes; then printf '%s\n' "$default"; return; fi
  read -r -p "$prompt [$default]: " reply </dev/tty || reply=""
  printf '%s\n' "${reply:-$default}"
}

confirm() {
  local prompt=$1 reply
  if $assume_yes; then return 0; fi
  read -r -p "$prompt [y/N]: " reply </dev/tty || reply=""
  [[ $reply =~ ^[Yy] ]]
}

confirm_system() {
  # Changing the system is never implied by --yes: it is asked, or --fix-deps.
  local prompt=$1
  if $fix_deps; then return 0; fi
  if $assume_yes; then return 1; fi
  confirm "$prompt"
}

# --- uninstall ---------------------------------------------------------------
if $uninstall; then
  step "Removing ScreenPolish"
  removed=false
  # Only ever remove what this script installs: an AppImage it put in place, a
  # symlink pointing at one, and a desktop entry it wrote. Anything else on
  # these paths belongs to another install and is reported, not deleted.
  if [ -L "$BIN_DIR/screenpolish" ]; then
    target=$(readlink -f "$BIN_DIR/screenpolish" || true)
    case $(basename "${target:-}") in
      ScreenPolish-*.AppImage)
        rm -f "$BIN_DIR/screenpolish"; ok "removed $BIN_DIR/screenpolish"; removed=true
        if [ -f "$target" ] && confirm "Also delete $target?"; then
          rm -f "$target"; ok "removed $target"
        fi ;;
      *)
        warn "$BIN_DIR/screenpolish points at ${target:-nothing}, which this script did not install; left alone" ;;
    esac
  fi
  if [ -e "$DESKTOP_FILE" ]; then
    if grep -qF "$MARKER" "$DESKTOP_FILE"; then
      rm -f "$DESKTOP_FILE"; ok "removed $DESKTOP_FILE"; removed=true
    else
      warn "$DESKTOP_FILE was not written by this script; left alone"
    fi
  fi
  # This script may be the kept copy; removing it while it runs is fine.
  case "${BASH_SOURCE[0]}" in
    */screenpolish-install.sh) rm -f "${BASH_SOURCE[0]}"; ok "removed ${BASH_SOURCE[0]}" ;;
  esac
  shopt -s nullglob
  for icon in "$ICON_DIR"/*/apps/screenpolish.png; do
    rm -f "$icon"; ok "removed $icon"; removed=true
  done
  shopt -u nullglob
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA_HOME/applications" 2>/dev/null || true
  $removed || warn "nothing this script installed was found"
  if pacman -Qi screenpolish >/dev/null 2>&1; then
    warn "A pacman package is also installed. Remove it with: sudo pacman -R screenpolish"
  fi
  say ""
  say "Your recordings in ~/Videos/ScreenPolish were not touched."
  exit 0
fi

# --- what is on this machine -------------------------------------------------
step "Checking this machine"
[ "${XDG_SESSION_TYPE:-}" = "wayland" ] && ok "Wayland session" || warn "Not a Wayland session; ScreenPolish is built for Wayland."
if pgrep -x Hyprland >/dev/null 2>&1 || [ -n "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
  ok "Hyprland is running"
else
  warn "Hyprland was not detected. Without it, capture falls back to the desktop portal,"
  warn "which bakes the system cursor into the video and leaves the drawn pointer with nothing to replace."
fi
missing_gsr=false
if command -v gpu-screen-recorder >/dev/null 2>&1; then
  ok "gpu-screen-recorder found"
else
  missing_gsr=true
  warn "gpu-screen-recorder is missing: cursor-free native capture needs it."
  warn "  Without it, capture falls back to the desktop portal, which bakes the"
  warn "  system cursor into the video."
fi
missing_input=false
if id -nG "$USER" 2>/dev/null | tr ' ' '\n' | grep -qx input; then
  ok "you are in the 'input' group, so clicks can be recorded"
else
  missing_input=true
  warn "You are not in the 'input' group. Clicks will not be recorded and automatic"
  warn "zoom will have nothing to work from."
fi

# --- offer to fix what is missing --------------------------------------------
# Both need root. The script never reads a password: sudo asks for it directly.
if $missing_gsr || $missing_input; then
  step "Fixing what is missing"
  if $missing_gsr; then
    if command -v pacman >/dev/null 2>&1; then
      if confirm_system "  Install gpu-screen-recorder now (sudo pacman -S gpu-screen-recorder)?"; then
        sudo pacman -S --needed gpu-screen-recorder && ok "gpu-screen-recorder installed"
      else
        warn "skipped; install it with: sudo pacman -S gpu-screen-recorder"
      fi
    else
      warn "Install gpu-screen-recorder with your distribution's package manager:"
      warn "  https://git.dec05eba.com/gpu-screen-recorder/about/"
    fi
  fi
  if $missing_input; then
    if confirm_system "  Add $USER to the 'input' group now (sudo usermod -aG input $USER)?"; then
      sudo usermod -aG input "$USER" && ok "added to 'input' — log out and back in for it to take effect"
    else
      warn "skipped; run: sudo usermod -aG input \$USER   then log out and back in"
    fi
  fi
fi

# --- pick the package --------------------------------------------------------
shopt -s nullglob
pacman_pkgs=("$from"/ScreenPolish-*.pacman)
appimages=("$from"/ScreenPolish-*.AppImage)
shopt -u nullglob

if [ ${#pacman_pkgs[@]} -eq 0 ] && [ ${#appimages[@]} -eq 0 ]; then
  say "No ScreenPolish package found in $from" >&2
  say "Put install.sh beside the .pacman or .AppImage file, or pass --from <folder>." >&2
  exit 1
fi

use_pacman=false
if ! $force_appimage && [ ${#pacman_pkgs[@]} -gt 0 ] && command -v pacman >/dev/null 2>&1; then
  use_pacman=true
fi

verify_checksum() {
  # Only if the sums file travelled with the package.
  local file=$1 sums=$from/SHA256SUMS.txt
  [ -f "$sums" ] || return 0
  if (cd "$from" && sha256sum --check --ignore-missing --status "$sums") 2>/dev/null; then
    ok "checksum verified against SHA256SUMS.txt"
  else
    warn "checksum does not match SHA256SUMS.txt for $(basename "$file")"
    confirm "Install it anyway?" || exit 1
  fi
}

# --- pacman ------------------------------------------------------------------
if $use_pacman; then
  pkg=${pacman_pkgs[-1]}
  step "Installing $(basename "$pkg")"
  verify_checksum "$pkg"
  say "  This is an Arch system, so the package goes to /opt/ScreenPolish, where pacman"
  say "  keeps it. pacman needs your password; this script does not read it."
  if confirm "Run: sudo pacman -U $(basename "$pkg")"; then
    sudo pacman -U "$pkg"
    ok "installed"
    say ""
    say "Launch it from your menu, or run: screenpolish"
    exit 0
  fi
  say "  Falling back to the AppImage, which installs without root."
  [ ${#appimages[@]} -gt 0 ] || { say "No AppImage here to fall back to." >&2; exit 1; }
fi

# --- AppImage ----------------------------------------------------------------
[ ${#appimages[@]} -gt 0 ] || { say "No AppImage found in $from" >&2; exit 1; }
app=${appimages[-1]}
version=$(basename "$app" | sed -n 's/^ScreenPolish-\(.*\)\.AppImage$/\1/p')

step "Installing ScreenPolish ${version:-} (AppImage)"
verify_checksum "$app"
[ -n "$dir" ] || dir=$(ask "  Where should it live?" "$DEFAULT_DIR")
dir=${dir/#\~/$HOME}
mkdir -p "$dir" "$BIN_DIR" "$(dirname "$DESKTOP_FILE")"

target=$dir/$(basename "$app")
install -m 755 "$app" "$target"
ok "installed to $target"

ln -sfn "$target" "$BIN_DIR/screenpolish"
ok "command: $BIN_DIR/screenpolish"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR is not on your PATH; add it to run 'screenpolish' from a terminal." ;;
esac

# The icon lives inside the AppImage; lift it out rather than shipping a copy.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if (cd "$tmp" && "$target" --appimage-extract 'usr/share/icons/hicolor/*/apps/screenpolish.png' >/dev/null 2>&1); then
  best=$(find "$tmp/squashfs-root" -name 'screenpolish.png' -print0 2>/dev/null | xargs -0 -r ls -S 2>/dev/null | head -1)
  if [ -n "$best" ]; then
    # hicolor/<size>/apps/... : the folder is a claim about the pixels in it,
    # so the icon keeps the size folder it came from rather than a guessed one.
    size=$(basename "$(dirname "$(dirname "$best")")")
    [[ $size =~ ^[0-9]+x[0-9]+$ ]] || size=256x256
    install -Dm 644 "$best" "$ICON_DIR/$size/apps/screenpolish.png"
    ok "icon installed at $size"
  fi
fi

# StartupWMClass is what Hyprland matches a windowrule against.
cat > "$DESKTOP_FILE" <<DESKTOP
[Desktop Entry]
Type=Application
Name=ScreenPolish
Comment=Screen recorder with automatic polish: click zoom, drawn cursor, backgrounds, MP4/GIF export
Exec=$target --no-sandbox %U
Icon=screenpolish
Terminal=false
Categories=AudioVideo;Recorder;
StartupWMClass=screenpolish
$MARKER
DESKTOP
ok "menu entry: $DESKTOP_FILE"

# The copy that ran this may be inside a self-extracting installer's temp
# directory, which is deleted on the way out, so uninstall keeps its own copy.
keep=$dir/screenpolish-install.sh
install -m 755 "${BASH_SOURCE[0]}" "$keep"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DATA_HOME/applications" 2>/dev/null || true

step "Done"
say "  Launch it from your menu, or run: screenpolish"
say "  Recordings are written to ~/Videos/ScreenPolish and never leave this machine."
say "  Remove it again with: $keep --uninstall"
