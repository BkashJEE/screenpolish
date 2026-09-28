#!/usr/bin/env bash
# Build one self-extracting installer from the packages handed to it.
#
#   scripts/make-installer.sh --app release/ScreenPolish-0.3.0.AppImage \
#     [--pacman release/ScreenPolish-0.3.0.pacman] [--out dist/]
#
# The result is a single executable file: the person downloading it runs it and
# ScreenPolish is installed, with no folder to keep together and no second file
# to lose. The payload is a zstd tarball appended to a shell stub, which checks
# the payload's checksum before it unpacks anything.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
app=""
pacman_pkg=""
out_dir=$ROOT/dist

while [ $# -gt 0 ]; do
  case $1 in
    --app) app=$2; shift 2 ;;
    --pacman) pacman_pkg=$2; shift 2 ;;
    --out) out_dir=$2; shift 2 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

[ -n "$app" ] || { echo "--app <AppImage> is required" >&2; exit 2; }
[ -f "$app" ] || { echo "No such file: $app" >&2; exit 1; }
version=$(basename "$app" | sed -n 's/^ScreenPolish-\(.*\)\.AppImage$/\1/p')
[ -n "$version" ] || { echo "Cannot read a version out of $(basename "$app")" >&2; exit 1; }

# The payload is built outside the staged tree: tarring a directory while
# writing into it makes tar warn that it changed as it was read, and that
# warning is an error under set -e.
stage=$(mktemp -d)
work=$(mktemp -d)
trap 'rm -rf "$stage" "$work"' EXIT
install -m 755 "$app" "$stage/$(basename "$app")"
[ -n "$pacman_pkg" ] && install -m 644 "$pacman_pkg" "$stage/$(basename "$pacman_pkg")"
install -m 755 "$ROOT/scripts/install.sh" "$stage/install.sh"
(cd "$stage" && sha256sum ./* > SHA256SUMS.txt)

payload=$work/payload.tar.zst
tar --zstd -cf "$payload" -C "$stage" .
payload_sum=$(sha256sum "$payload" | cut -d' ' -f1)

mkdir -p "$out_dir"
out=$out_dir/ScreenPolish-$version-installer.run

# %012d keeps the offset a fixed width, so writing it back cannot move it.
stub=$work/stub.sh
cat > "$stub" <<STUB
#!/usr/bin/env bash
# ScreenPolish $version — self-extracting installer.
# Everything below the marker is a zstd tarball; this part unpacks it and runs
# the installer inside. Nothing is downloaded and nothing is sent anywhere.
set -euo pipefail
# Zero-padded so writing it back cannot change the stub's size, and read as
# base 10 because bash reads a leading zero as octal, where 8 and 9 are errors.
OFFSET=000000000000
SUM=$payload_sum
VERSION=$version
start=\$((10#\$OFFSET + 1))

case \${1:-} in
  --extract-only)
    dest=\${2:-./screenpolish-$version}
    mkdir -p "\$dest"
    tail -c +\$start "\$0" | tar --zstd -x -C "\$dest"
    echo "Unpacked to \$dest"; exit 0 ;;
  --version) echo "ScreenPolish $version installer"; exit 0 ;;
esac

command -v zstd >/dev/null 2>&1 || { echo "This installer needs zstd. Install it, or use the AppImage directly." >&2; exit 1; }

tmp=\$(mktemp -d)
trap 'rm -rf "\$tmp"' EXIT
printf 'Unpacking ScreenPolish %s…\n' "\$VERSION"
tail -c +\$start "\$0" > "\$tmp/payload.tar.zst"
got=\$(sha256sum "\$tmp/payload.tar.zst" | cut -d' ' -f1)
if [ "\$got" != "\$SUM" ]; then
  echo "This download is damaged: the payload checksum does not match." >&2
  echo "  expected \$SUM" >&2
  echo "  got      \$got" >&2
  exit 1
fi
tar --zstd -xf "\$tmp/payload.tar.zst" -C "\$tmp"
rm -f "\$tmp/payload.tar.zst"
# Not exec: exec drops the EXIT trap, and the unpacked payload — a few hundred
# megabytes of it — would stay in /tmp for good.
"\$tmp/install.sh" --from "\$tmp" "\$@" || exit \$?
# Nothing below this line is shell: it is the tarball.
exit 0
#PAYLOAD_BELOW
STUB

# The offset is the stub's own size, once the marker line is the last of it.
offset=$(wc -c < "$stub")
sed "s/^OFFSET=000000000000$/OFFSET=$(printf '%012d' "$offset")/" "$stub" > "$out"
[ "$(wc -c < "$out")" -eq "$offset" ] || { echo "Stub changed size while writing the offset" >&2; exit 1; }
cat "$payload" >> "$out"
chmod 755 "$out"

echo "Wrote $out"
echo "  $(du -h "$out" | cut -f1), payload sha256 ${payload_sum:0:12}…"
echo "  Contents: $(tar --zstd -tf "$payload" | grep -cv '^\./$') files"
