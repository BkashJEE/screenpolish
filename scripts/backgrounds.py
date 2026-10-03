#!/usr/bin/env python3
"""Draw the background images that ship with ScreenPolish.

Nothing here is downloaded and nothing is licensed from anyone: every pixel is
computed, which is what makes these safe to redistribute with the app. Stock
"free" backgrounds usually permit use but not passing the file on, which is
exactly what bundling in a public repository does.

    python3 scripts/backgrounds.py --out resources/backgrounds

Each image is deterministic from its seed, so one can be reproduced rather than
being a lucky render, and a change to the maths can be seen as a diff.

Standard library only, deliberately: contributors should not need Pillow or
numpy to rebuild what ships. PNGs are written by hand, which is just a zlib
stream of filtered scanlines.
"""
from __future__ import annotations

import argparse
import math
import random
import struct
import zlib
from pathlib import Path

# Smooth fields upscale cleanly, and the renderer covers the output anyway, so
# there is no reason to carry 4K files for what is mostly a soft wash.
WIDTH = 1600
HEIGHT = 900


def write_png(path: Path, rows: list[bytearray]) -> None:
    """Write 8-bit RGB rows as a PNG. Each scanline gets filter type 0."""
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', WIDTH, HEIGHT, 8, 2, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    path.write_bytes(png)


def hex_rgb(value: str) -> tuple[float, float, float]:
    v = value.lstrip('#')
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16))


def clamp8(v: float) -> int:
    return 0 if v < 0 else (255 if v > 255 else int(v))


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 == edge0:
        return 0.0
    t = (x - edge0) / (edge1 - edge0)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return t * t * (3 - 2 * t)


class Blob:
    """One soft colour source. Influence falls off smoothly to nothing at `radius`."""

    def __init__(self, x: float, y: float, radius: float, color: str):
        self.x = x
        self.y = y
        self.radius = radius
        self.rgb = hex_rgb(color)


def mesh(base: str, blobs: list[Blob], grain: float, seed: int) -> list[bytearray]:
    """Several coloured blobs blended over a base, the look gradients cannot reach."""
    rnd = random.Random(seed)
    br, bg, bb = hex_rgb(base)
    rows: list[bytearray] = []
    # Pre-compute per-row so the inner loop stays cheap.
    for y in range(HEIGHT):
        row = bytearray()
        fy = y / HEIGHT
        for x in range(WIDTH):
            fx = x / WIDTH
            r, g, b = br, bg, bb
            for blob in blobs:
                dx = (fx - blob.x) * (WIDTH / HEIGHT)
                dy = fy - blob.y
                d = math.sqrt(dx * dx + dy * dy)
                w = smoothstep(blob.radius, 0.0, d)
                if w <= 0:
                    continue
                r += (blob.rgb[0] - r) * w
                g += (blob.rgb[1] - g) * w
                b += (blob.rgb[2] - b) * w
            if grain > 0:
                n = (rnd.random() - 0.5) * grain
                r += n
                g += n
                b += n
            row += bytes((clamp8(r), clamp8(g), clamp8(b)))
        rows.append(row)
    return rows


def ruled(base: str, tint: str, spacing: int, thickness: int, fade: float, seed: int) -> list[bytearray]:
    """A quiet grid that reads as texture rather than as a pattern to look at."""
    rnd = random.Random(seed)
    br, bg, bb = hex_rgb(base)
    tr, tg, tb = hex_rgb(tint)
    rows: list[bytearray] = []
    for y in range(HEIGHT):
        row = bytearray()
        fy = y / HEIGHT
        on_h = (y % spacing) < thickness
        for x in range(WIDTH):
            fx = x / WIDTH
            # Darken toward the edges so the middle holds the eye.
            d = math.sqrt((fx - 0.5) ** 2 + (fy - 0.5) ** 2) / 0.7071
            vign = 1 - fade * d * d
            r, g, b = br * vign, bg * vign, bb * vign
            if on_h or (x % spacing) < thickness:
                k = 0.5 * vign
                r += (tr - r) * k
                g += (tg - g) * k
                b += (tb - b) * k
            n = (rnd.random() - 0.5) * 3
            row += bytes((clamp8(r + n), clamp8(g + n), clamp8(b + n)))
        rows.append(row)
    return rows


def spotlight(base: str, glow: str, cx: float, cy: float, radius: float, seed: int) -> list[bytearray]:
    """A single soft pool of light: the most forgiving background for a bright UI."""
    rnd = random.Random(seed)
    br, bg, bb = hex_rgb(base)
    gr, gg, gb = hex_rgb(glow)
    rows: list[bytearray] = []
    for y in range(HEIGHT):
        row = bytearray()
        fy = y / HEIGHT
        for x in range(WIDTH):
            fx = x / WIDTH
            dx = (fx - cx) * (WIDTH / HEIGHT)
            dy = fy - cy
            d = math.sqrt(dx * dx + dy * dy)
            w = smoothstep(radius, 0.0, d)
            n = (rnd.random() - 0.5) * 2.5
            row += bytes((
                clamp8(br + (gr - br) * w + n),
                clamp8(bg + (gg - bg) * w + n),
                clamp8(bb + (gb - bb) * w + n)
            ))
        rows.append(row)
    return rows


# What ships. A short shelf of distinct looks beats a long one of near-duplicates.
BACKGROUNDS: dict[str, tuple[str, callable]] = {
    'aurora.png': (
        'cool greens and blues drifting across a near-black field',
        lambda: mesh('#0b1016', [
            Blob(0.18, 0.22, 0.55, '#1f6f5c'),
            Blob(0.78, 0.30, 0.50, '#2a4d8f'),
            Blob(0.55, 0.82, 0.60, '#14364a'),
            Blob(0.92, 0.85, 0.40, '#1d7a6b'),
        ], grain=4, seed=11)
    ),
    'ember.png': (
        'warm low light, for takes with a lot of white in them',
        lambda: mesh('#120b0b', [
            Blob(0.22, 0.78, 0.55, '#7a2f1b'),
            Blob(0.80, 0.25, 0.50, '#8a4a1f'),
            Blob(0.50, 0.50, 0.45, '#3d1a14'),
        ], grain=4, seed=29)
    ),
    'violet-haze.png': (
        'purple into deep blue, the default for a product shot',
        lambda: mesh('#0d0b16', [
            Blob(0.25, 0.30, 0.58, '#4b2f8f'),
            Blob(0.75, 0.70, 0.55, '#7a3f9a'),
            Blob(0.60, 0.15, 0.40, '#2b2f7a'),
        ], grain=4, seed=47)
    ),
    'slate-mesh.png': (
        'neutral grey wash that competes with nothing',
        lambda: mesh('#14171c', [
            Blob(0.20, 0.25, 0.60, '#2c333d'),
            Blob(0.80, 0.75, 0.55, '#3a414b'),
            Blob(0.55, 0.45, 0.45, '#1d2228'),
        ], grain=3, seed=73)
    ),
    'daylight.png': (
        'a pale wash for dark application captures',
        lambda: mesh('#eef1f6', [
            Blob(0.22, 0.25, 0.60, '#dfe6f2'),
            Blob(0.78, 0.72, 0.55, '#e9e3f0'),
            Blob(0.55, 0.50, 0.45, '#f6f8fb'),
        ], grain=3, seed=101)
    ),
    'grid.png': (
        'a quiet ruled grid, closer to paper than to a blueprint',
        lambda: ruled('#141821', '#2e3a4d', spacing=48, thickness=2, fade=0.45, seed=137)
    ),
    'spotlight.png': (
        'one soft pool of light, centred a little high',
        lambda: spotlight('#0a0c10', '#273246', 0.5, 0.42, 0.75, seed=191)
    ),
    'dawn.png': (
        'a cool-to-warm sweep that reads as depth rather than colour',
        lambda: mesh('#101522', [
            Blob(0.15, 0.85, 0.65, '#2a3a6b'),
            Blob(0.85, 0.18, 0.60, '#6b4a3a'),
            Blob(0.50, 0.50, 0.50, '#1b2436'),
        ], grain=4, seed=223)
    ),
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='resources/backgrounds', help='where the .png files go')
    parser.add_argument('--only', default='', help='render one background by file name')
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, (note, draw) in BACKGROUNDS.items():
        if args.only and args.only.lower() not in name.lower():
            continue
        path = out / name
        write_png(path, draw())
        print(f'{name}: {path.stat().st_size // 1024} KB — {note}')


if __name__ == '__main__':
    main()
