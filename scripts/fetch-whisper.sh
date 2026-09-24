#!/usr/bin/env bash
# Fetch the local speech engine for captions into vendor/whisper/:
#   whisper-cli        built from whisper.cpp at a pinned release
#   ggml-base.en.bin   the English base model, checked against its published SHA1
# electron-builder packages vendor/whisper as resources/whisper. Neither file is
# committed: the model is 142 MiB and the binary is per platform.
#
# Re-running is cheap: a model with the right checksum and a built binary are kept.
set -euo pipefail

WHISPER_TAG=v1.9.3
WHISPER_COMMIT=371b5a7                                   # release : v1.9.3 (#4000)
MODEL=ggml-base.en.bin
MODEL_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL
MODEL_SHA1=137c40403d78fd54d454da0f9bd998f78703390c      # whisper.cpp models/README.md

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT=$ROOT/vendor/whisper
BUILD=$ROOT/vendor/whisper-build
mkdir -p "$OUT"

# Model -----------------------------------------------------------------------
if [ -f "$OUT/$MODEL" ] && echo "$MODEL_SHA1  $OUT/$MODEL" | sha1sum -c --quiet 2>/dev/null; then
  echo "model: $MODEL present and verified"
else
  echo "model: downloading $MODEL (142 MiB) from $MODEL_URL"
  curl -fL --retry 3 -o "$OUT/$MODEL.part" "$MODEL_URL"
  echo "$MODEL_SHA1  $OUT/$MODEL.part" | sha1sum -c --quiet || { echo "model: checksum mismatch, refusing it" >&2; rm -f "$OUT/$MODEL.part"; exit 1; }
  mv "$OUT/$MODEL.part" "$OUT/$MODEL"
  echo "model: verified"
fi

# Engine ----------------------------------------------------------------------
if [ -x "$OUT/whisper-cli" ] && [ "$(cat "$OUT/whisper-cli.version" 2>/dev/null)" = "$WHISPER_COMMIT" ]; then
  echo "engine: whisper-cli $WHISPER_TAG present"
else
  echo "engine: building whisper-cli $WHISPER_TAG"
  rm -rf "$BUILD"
  git clone -q --depth 1 --branch "$WHISPER_TAG" https://github.com/ggml-org/whisper.cpp "$BUILD/src"
  actual=$(git -C "$BUILD/src" rev-parse --short=7 HEAD)
  [ "$actual" = "$WHISPER_COMMIT" ] || { echo "engine: $WHISPER_TAG is $actual, expected $WHISPER_COMMIT; refusing it" >&2; exit 1; }
  # Portable: not tuned to this CPU, so the packaged app runs on other x86-64
  # machines with AVX2 (every Intel since 2013, every AMD since 2015). Static,
  # so it needs nothing beyond the C and C++ runtimes.
  cmake -S "$BUILD/src" -B "$BUILD/out" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DGGML_NATIVE=OFF -DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DGGML_OPENMP=OFF \
    -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF > "$BUILD/cmake.log"
  cmake --build "$BUILD/out" -j "$(nproc)" --target whisper-cli > "$BUILD/build.log"
  cp "$BUILD/out/bin/whisper-cli" "$OUT/whisper-cli"
  echo "$WHISPER_COMMIT" > "$OUT/whisper-cli.version"
  rm -rf "$BUILD"
  echo "engine: built"
fi

# Prove the pair works before anything is packaged with it.
"$OUT/whisper-cli" -m "$OUT/$MODEL" --help > /dev/null 2>&1 || { echo "whisper-cli does not run" >&2; exit 1; }
echo "ok: $OUT"
