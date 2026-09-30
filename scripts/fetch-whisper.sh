#!/usr/bin/env bash
# Fetch the local speech engine for captions into vendor/whisper/:
#   whisper-cli(.exe)  whisper.cpp at a pinned release, checked against a pinned hash
#   ggml-base.en.bin   the English base model, checked against its published SHA1
# electron-builder packages vendor/whisper as resources/whisper on every platform.
# Neither file is committed: the model is 142 MiB and the binary is per platform.
#
# Per platform:
#   Linux    built from the release source tarball (sha256-pinned): static, AVX2,
#            so it runs on other x86-64 machines.
#   macOS    built from the same tarball as one universal binary (arm64 and
#            x86_64, joined with lipo), Metal on with the shader library embedded
#            so the engine stays a single file. Override with WHISPER_MAC_ARCHS.
#   Windows  whisper.cpp publishes no binaries on the v1.9.3 tag, but its b4938
#            build release was cut from the same commit, so whisper-cli.exe and
#            the DLLs it loads are taken from that zip, sha256-pinned. Run this
#            from Git Bash (CI's `shell: bash` is Git Bash).
#
# Re-running is cheap: a model with the right checksum and an engine with the
# right version marker are kept.
set -euo pipefail

WHISPER_TAG=v1.9.3
WHISPER_COMMIT=371b5a7                                   # release : v1.9.3 (#4000), 371b5a7561823ab2bb32142d2751e35e7534727b
SOURCE_URL=https://github.com/ggml-org/whisper.cpp/archive/refs/tags/$WHISPER_TAG.tar.gz
SOURCE_SHA256=1650f884effba487025143bd8facd2f9fb40a83b3737a732803c67a8d659d9c0
WIN_ZIP_URL=https://github.com/ggml-org/whisper.cpp/releases/download/b4938/whisper-bin-x64.zip
WIN_ZIP_SHA256=c2a4b60edb11f7e11a9191ffb50929535527d4d91c9903dbe3e554583bbbc63d
MODEL=ggml-base.en.bin
MODEL_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL
MODEL_SHA1=137c40403d78fd54d454da0f9bd998f78703390c      # whisper.cpp models/README.md

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/vendor/whisper
BUILD=$ROOT/vendor/whisper-build
mkdir -p "$OUT"

case "$(uname -s)" in
  Linux) PLATFORM=linux; BIN=whisper-cli ;;
  Darwin) PLATFORM=mac; BIN=whisper-cli ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=win; BIN=whisper-cli.exe ;;
  *) echo "fetch-whisper: unsupported system $(uname -s)" >&2; exit 1 ;;
esac

# Helpers ---------------------------------------------------------------------
# sha1sum/sha256sum on Linux and Git Bash; macOS ships shasum instead.
digest() { # digest sha1|sha256 FILE
  if command -v "$1sum" > /dev/null 2>&1; then "$1sum" "$2" | cut -d' ' -f1
  elif command -v shasum > /dev/null 2>&1; then shasum -a "${1#sha}" "$2" | cut -d' ' -f1
  else echo "fetch-whisper: no $1sum or shasum on PATH" >&2; return 1
  fi
}
verify() { # verify sha1|sha256 EXPECTED FILE LABEL
  local actual
  actual=$(digest "$1" "$3")
  if [ "$actual" != "$2" ]; then
    echo "$4: checksum mismatch ($1 $actual, expected $2), refusing it" >&2
    rm -f "$3"
    exit 1
  fi
}
cores() { nproc 2> /dev/null || sysctl -n hw.logicalcpu 2> /dev/null || echo 4; }

# Model -----------------------------------------------------------------------
if [ -f "$OUT/$MODEL" ] && [ "$(digest sha1 "$OUT/$MODEL")" = "$MODEL_SHA1" ]; then
  echo "model: $MODEL present and verified"
else
  echo "model: downloading $MODEL (142 MiB) from $MODEL_URL"
  curl -fL --retry 3 -o "$OUT/$MODEL.part" "$MODEL_URL"
  verify sha1 "$MODEL_SHA1" "$OUT/$MODEL.part" model
  mv "$OUT/$MODEL.part" "$OUT/$MODEL"
  echo "model: verified"
fi

# Engine ----------------------------------------------------------------------
# Options shared by every source build. Not tuned to the build machine, so the
# packaged app runs elsewhere. Static, so it needs nothing beyond the C and C++
# runtimes (and on macOS the system frameworks).
COMMON_OPTS=(-DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF)
# x86-64 with AVX2 (every Intel since 2013, every AMD since 2015).
X86_OPTS=(-DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON)

unpack_source() {
  echo "engine: downloading whisper.cpp $WHISPER_TAG source"
  curl -fL --retry 3 -o "$BUILD/src.tar.gz" "$SOURCE_URL"
  verify sha256 "$SOURCE_SHA256" "$BUILD/src.tar.gz" "engine source"
  mkdir -p "$BUILD/src"
  tar -xzf "$BUILD/src.tar.gz" -C "$BUILD/src" --strip-components=1
}

build_linux() {
  unpack_source
  echo "engine: building whisper-cli $WHISPER_TAG"
  cmake -S "$BUILD/src" -B "$BUILD/out" "${COMMON_OPTS[@]}" "${X86_OPTS[@]}" > "$BUILD/cmake.log"
  cmake --build "$BUILD/out" -j "$(cores)" --target whisper-cli > "$BUILD/build.log"
  cp "$BUILD/out/bin/whisper-cli" "$OUT/whisper-cli"
}

build_mac() {
  unpack_source
  local archs=${WHISPER_MAC_ARCHS:-arm64 x86_64} arch slices=()
  # Electron 40 runs on macOS 11 and later; the engine should too.
  local min=${WHISPER_MACOS_MIN:-11.0}
  for arch in $archs; do
    echo "engine: building whisper-cli $WHISPER_TAG for $arch (Metal on)"
    local opts=("${COMMON_OPTS[@]}" -DCMAKE_OSX_ARCHITECTURES="$arch" -DCMAKE_OSX_DEPLOYMENT_TARGET="$min"
      -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON)
    [ "$arch" = x86_64 ] && opts+=("${X86_OPTS[@]}")
    cmake -S "$BUILD/src" -B "$BUILD/out-$arch" "${opts[@]}" > "$BUILD/cmake-$arch.log"
    cmake --build "$BUILD/out-$arch" -j "$(cores)" --target whisper-cli > "$BUILD/build-$arch.log"
    slices+=("$BUILD/out-$arch/bin/whisper-cli")
  done
  if [ "${#slices[@]}" -gt 1 ]; then
    lipo -create -output "$OUT/whisper-cli" "${slices[@]}"
  else
    cp "${slices[0]}" "$OUT/whisper-cli"
  fi
}

fetch_win() {
  echo "engine: downloading whisper.cpp's prebuilt whisper-bin-x64.zip (release b4938 = $WHISPER_TAG)"
  curl -fL --retry 3 -o "$BUILD/whisper-bin-x64.zip" "$WIN_ZIP_URL"
  verify sha256 "$WIN_ZIP_SHA256" "$BUILD/whisper-bin-x64.zip" engine
  # whisper-cli.exe plus what it loads at run time: whisper.dll, ggml.dll,
  # ggml-base.dll and the ggml-cpu-*.dll variants it picks by CPU feature.
  # Not llama.dll, parakeet.dll or SDL2.dll, which only the other tools use.
  rm -f "$OUT"/whisper-cli.exe "$OUT"/whisper.dll "$OUT"/ggml*.dll
  if command -v unzip > /dev/null 2>&1; then
    unzip -q -o -j "$BUILD/whisper-bin-x64.zip" 'Release/whisper-cli.exe' 'Release/whisper.dll' 'Release/ggml*.dll' -d "$OUT"
  elif command -v 7z > /dev/null 2>&1; then
    7z e -y -o"$OUT" "$BUILD/whisper-bin-x64.zip" Release/whisper-cli.exe Release/whisper.dll 'Release/ggml*.dll' > /dev/null
  else
    echo "engine: need unzip or 7z to extract the Windows engine" >&2
    exit 1
  fi
}

if [ -f "$OUT/$BIN" ] && [ "$(cat "$OUT/whisper-cli.version" 2> /dev/null)" = "$WHISPER_COMMIT" ]; then
  echo "engine: $BIN $WHISPER_TAG present"
else
  rm -rf "$BUILD"
  mkdir -p "$BUILD"
  case $PLATFORM in
    linux) build_linux ;;
    mac) build_mac ;;
    win) fetch_win ;;
  esac
  echo "$WHISPER_COMMIT" > "$OUT/whisper-cli.version"
  rm -rf "$BUILD"
  echo "engine: ready"
fi

# Prove the pair works before anything is packaged with it.
"$OUT/$BIN" -m "$OUT/$MODEL" --help > /dev/null 2>&1 || { echo "$BIN does not run" >&2; exit 1; }
echo "ok: $OUT"
