#!/usr/bin/env python3
"""Checks on the parts of the generator that can be wrong quietly.

Run: python3 scripts/lofi-tracks.test.py
"""
import importlib.util
import math
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location('lofi', Path(__file__).with_name('lofi-tracks.py'))
lofi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lofi)

failures = []


def check(name, condition, detail=''):
    if condition:
        print(f'  ok   {name}')
    else:
        failures.append(f'{name}: {detail}')
        print(f'  FAIL {name}  {detail}')


print('envelope')
env = lofi.envelope(lofi.SR, attack=0.1, decay=0.2, sustain=0.5)
check('starts at silence', env[0] == 0.0, f'got {env[0]}')
check('reaches full at the end of the attack', abs(max(env) - 1.0) < 1e-6, f'peak {max(env)}')
check('ends at silence, so notes cannot click', env[-1] < 1e-6, f'got {env[-1]}')
check('never leaves 0..1', all(0.0 <= v <= 1.0 for v in env))

print('tone')
note = lofi.tone(440.0, 0.25, gain=0.5)
check('is the requested length', len(note) == int(0.25 * lofi.SR), f'got {len(note)}')
check('stays inside the rails', max(abs(v) for v in note) <= 1.0, f'peak {max(abs(v) for v in note)}')
check('is not silence', max(abs(v) for v in note) > 0.05)

print('kick')
k = lofi.kick()
first, last = abs(k[100]), abs(k[-100])
check('decays rather than holding', first > last, f'{first:.3f} -> {last:.3f}')

print('mix_into')
buf = [0.0] * 100
lofi.mix_into(buf, [1.0, 1.0], 0.0)
check('adds at the start', buf[0] == 1.0)
lofi.mix_into(buf, [1.0] * 10, 99 / lofi.SR)
check('drops what runs past the end rather than raising', len(buf) == 100)
lofi.mix_into(buf, [1.0], -1.0)
check('ignores a negative offset', buf[0] == 1.0)

print('chords')
check('reads note names', lofi.chord('A3 C4') == [220.0, 261.63])

print('tracks')
names = [t.filename for t in lofi.TRACKS]
check('every file name is unique', len(names) == len(set(names)))
check('every seed is unique', len({t.seed for t in lofi.TRACKS}) == len(lofi.TRACKS))
check('all are .wav', all(n.endswith('.wav') for n in names))
check('at least one has no drums, for talking over', any(not t.drums for t in lofi.TRACKS))
check('every chord resolves to four voices', all(len(c) == 4 for t in lofi.TRACKS for c in t.chords))

print('determinism')
a, _ = lofi.render(lofi.TRACKS[0])
b, _ = lofi.render(lofi.TRACKS[0])
check('the same seed gives the same bytes', a == b, 'renders differ')

if failures:
    print(f'\n{len(failures)} failed')
    sys.exit(1)
print('\nall checks passed')
