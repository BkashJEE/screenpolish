#!/usr/bin/env python3
"""Write the lo-fi tracks that ship with ScreenPolish's music shelf.

Nothing here is sampled and nothing is licensed from anyone: every sound is
computed, which is what makes these safe to redistribute with the app. Most
"royalty free" libraries let you *use* a track but not pass the file on, which
is exactly what bundling in a public repository does.

    python3 scripts/lofi-tracks.py --out resources/music

Each track is deterministic from its seed, so a track can be reproduced rather
than being a lucky render, and a change to the synth can be heard as a diff.

Standard library only, deliberately: contributors should not need numpy to
rebuild the music that ships.
"""
from __future__ import annotations

import argparse
import array
import math
import random
import wave
from pathlib import Path

SR = 44100


def envelope(n: int, attack: float, decay: float, sustain: float) -> list[float]:
    """Attack to 1, decay to `sustain`, then a straight fall to silence."""
    a = max(1, int(attack * SR))
    d = max(1, int(decay * SR))
    out = []
    for i in range(n):
        if i < a:
            out.append(i / a)
        elif i < a + d:
            out.append(1 - (1 - sustain) * ((i - a) / d))
        else:
            # The last sample has to be exactly zero, or the note ends part way
            # up its own amplitude and that step is a click.
            tail = (i - a - d) / max(1, n - a - d - 1)
            out.append(sustain * max(0.0, 1 - tail))
    return out


def tone(freq: float, dur: float, gain: float, detune: float = 0.0,
         harmonics=(1.0, 0.35, 0.12), attack=0.02, decay=0.6, sustain=0.25) -> list[float]:
    """A note: a few harmonics under one envelope. Detune keeps stacks alive."""
    n = int(dur * SR)
    env = envelope(n, attack, decay, sustain)
    buf = [0.0] * n
    for k, level in enumerate(harmonics, start=1):
        step = 2 * math.pi * freq * k * (1 + detune) / SR
        for i in range(n):
            buf[i] += math.sin(step * i) * level
    return [v * gain * env[i] for i, v in enumerate(buf)]


def kick(dur: float = 0.45, gain: float = 0.85) -> list[float]:
    """Pitch drops from 110 Hz into the floor: the whole character of a kick."""
    n = int(dur * SR)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / n
        phase += 2 * math.pi * (110 * math.exp(-4.5 * t) + 42) / SR
        out.append(math.sin(phase) * gain * math.exp(-5.5 * t))
    return out


def noise_hit(dur: float, gain: float, rnd: random.Random,
              tilt: float = 0.6, decay: float = 28.0) -> list[float]:
    """Hats and rimshots are the same burst of noise, filtered differently."""
    n = int(dur * SR)
    out = []
    prev = 0.0
    for i in range(n):
        white = rnd.uniform(-1, 1)
        prev += tilt * (white - prev)          # one-pole low-pass
        out.append((white - prev) * gain * math.exp(-decay * i / n))
    return out


def mix_into(dst: list[float], src: list[float], at_seconds: float) -> None:
    start = int(at_seconds * SR)
    for k, v in enumerate(src):
        i = start + k
        if 0 <= i < len(dst):
            dst[i] += v


NOTES = {
    'A2': 110.00, 'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00,
    'A3': 220.00, 'B3': 246.94, 'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
    'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 'C5': 523.25,
}


def chord(names: str) -> list[float]:
    return [NOTES[n] for n in names.split()]


class Track:
    def __init__(self, filename: str, bpm: int, chords: list[str], seed: int,
                 swing: float = 0.0, drums: bool = True, repeats: int = 4,
                 bars_per_chord: int = 2, note: str = ''):
        self.filename = filename
        self.bpm = bpm
        self.chords = [chord(c) for c in chords] * repeats
        self.seed = seed
        self.swing = swing
        self.drums = drums
        self.bars_per_chord = bars_per_chord
        self.note = note


# What ships. Keep the list short: a shelf of four is a choice, twenty is a
# chore, and the point is that a take has *something* under it in one click.
TRACKS = [
    Track('Desk Lamp.wav', 72, ['A3 C4 E4 G4', 'F3 A3 C4 E4', 'C4 E4 G4 B4', 'G3 B3 D4 F4'],
          seed=11, swing=0.12, note='soft kit, the default bed'),
    Track('Late Commit.wav', 80, ['D3 F3 A3 C4', 'G3 B3 D4 F4', 'C4 E4 G4 B4', 'A3 C4 E4 G4'],
          seed=29, swing=0.16, note='brighter, a little more forward'),
    Track('Window Rain.wav', 64, ['E3 G3 B3 D4', 'C4 E4 G4 B4', 'A3 C4 E4 G4', 'D3 F3 A3 C4'],
          seed=47, swing=0.0, drums=False, note='no drums, for talking over'),
    Track('Night Shift.wav', 68, ['A3 C4 E4 G4', 'D3 F3 A3 C4', 'E3 G3 B3 D4', 'A3 C4 E4 G4'],
          seed=73, swing=0.14, note='minor, slower, keeps its distance'),
    Track('Paper Cup.wav', 76, ['F3 A3 C4 E4', 'C4 E4 G4 B4', 'D3 F3 A3 C4', 'G3 B3 D4 F4'],
          seed=101, swing=0.18, note='warmest of the set'),
    Track('Long Weekend.wav', 60, ['C4 E4 G4 B4', 'A3 C4 E4 G4', 'F3 A3 C4 E4', 'G3 B3 D4 F4'],
          seed=137, swing=0.0, drums=False, note='pad only, barely there'),
]


def render(track: Track) -> tuple[bytes, float]:
    rnd = random.Random(track.seed)
    beat = 60 / track.bpm
    bar = beat * 4
    total = bar * track.bars_per_chord * len(track.chords)
    n = int(total * SR) + SR
    left = [0.0] * n

    for index, voices in enumerate(track.chords):
        root = voices[0]
        for b in range(track.bars_per_chord):
            at = index * bar * track.bars_per_chord + b * bar
            # Chord on the one, and again late on the three, quieter.
            for offset, gain in ((0.0, 0.32), (beat * 2 + track.swing * beat, 0.20)):
                for voice, freq in enumerate(voices):
                    mix_into(left, tone(freq, bar * 0.9, gain * (0.85 ** voice),
                                        detune=rnd.uniform(-0.002, 0.002),
                                        attack=0.03 + 0.01 * voice, decay=0.8, sustain=0.22), at + offset)
            mix_into(left, tone(root / 2, beat * 2.4, 0.34, harmonics=(1.0, 0.18),
                                attack=0.01, decay=0.5, sustain=0.15), at)
            if not track.drums:
                continue
            mix_into(left, kick(), at)
            mix_into(left, kick(gain=0.6), at + beat * 2 + track.swing * beat * 0.5)
            for two_and_four in (beat, beat * 3):
                mix_into(left, noise_hit(0.16, 0.30, rnd, tilt=0.45, decay=34), at + two_and_four)
            for eighth in range(8):
                swung = track.swing * beat / 2 if eighth % 2 else 0
                mix_into(left, noise_hit(0.05, 0.075 if eighth % 2 else 0.11, rnd, tilt=0.9, decay=60),
                         at + eighth * beat / 2 + swung)

    # Vinyl: steady air, and the occasional pop.
    prev = 0.0
    for i in range(n):
        white = rnd.uniform(-1, 1)
        prev += 0.25 * (white - prev)
        left[i] += (white - prev) * 0.010
    for _ in range(int(total * 2.5)):
        mix_into(left, noise_hit(0.012, rnd.uniform(0.05, 0.16), rnd, tilt=0.8, decay=90),
                 rnd.uniform(0, total))

    # Warmth, then a slow tape wobble on the right channel only, which is what
    # puts the sound around the listener instead of between the speakers.
    low = 0.0
    for i in range(n):
        low += 0.22 * (left[i] - low)
        left[i] = low
    right = [0.0] * n
    for i in range(n):
        delay = int(60 + 45 * math.sin(2 * math.pi * 0.07 * i / SR))
        right[i] = left[i - delay] if i - delay >= 0 else 0.0

    peak = max(max(abs(v) for v in left), 1e-9)
    gain = 0.72 / peak
    frames = array.array('h')
    for i in range(n):
        frames.append(int(max(-1.0, min(1.0, left[i] * gain)) * 32767))
        frames.append(int(max(-1.0, min(1.0, right[i] * 0.92 * gain)) * 32767))
    return frames.tobytes(), total


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='resources/music', help='where the .wav files go')
    parser.add_argument('--only', default='', help='render one track by file name')
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for track in TRACKS:
        if args.only and args.only.lower() not in track.filename.lower():
            continue
        frames, seconds = render(track)
        path = out / track.filename
        with wave.open(str(path), 'wb') as handle:
            handle.setnchannels(2)
            handle.setsampwidth(2)
            handle.setframerate(SR)
            handle.writeframes(frames)
        minutes, rest = divmod(int(seconds), 60)
        print(f'{track.filename}: {minutes}:{rest:02d} at {track.bpm} bpm — {track.note}')


if __name__ == '__main__':
    main()
