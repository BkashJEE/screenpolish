// Generates the feature flashcards in docs/images/features/ used by README.md
// and docs/FEATURES.md. Run `node scripts/feature-cards.mjs` after changing a card.
// Cards show shipped features only; platform chips must match the platform notes.
//
// `--edition public` draws the cards for the public Omarchy edition: Linux only,
// and without the themed pack, which that edition does not ship. The export tool
// runs it that way inside the tree it builds.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'docs/images/features')
const PUBLIC = process.argv.includes('--edition') && process.argv[process.argv.indexOf('--edition') + 1] === 'public'

const W = 600
const H = 340
const FONT = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
const C = {
  ink: '#f1f2f5', muted: '#a3a9b5', edge: '#2a2e37', top: '#1a1d24', bottom: '#111318',
  accent: '#f2804f', tile: '#2b1c14', ok: '#5fcb98', okBg: '#15302a', soon: '#9097a3', soonBg: '#22262d'
}
// The private build runs on both platforms; the public Omarchy edition is Linux only.
const BOTH = PUBLIC ? [['Linux · Hyprland', 'ok']] : [['Linux', 'ok'], ['Windows', 'ok']]
const CAPTIONS = PUBLIC ? [['Linux', 'ok']] : [['Linux', 'ok'], ['Windows soon', 'soon']]
const pick = (privateText, publicText) => (PUBLIC ? publicText : privateText)

// Icons are drawn on a 24-unit grid with round strokes.
const ICONS = {
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/>',
  capture: '<rect x="2.5" y="4" width="19" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M9 8v6l1.7-1.6 1.4 2.8 1.2-.6-1.4-2.7H14z" fill="currentColor"/><path d="M4 5.5 20 15.5"/>',
  cursor: '<path d="M6 3v15l4-3.8 2.8 6 2.4-1.1-2.8-5.9H18z"/><path d="M19 3v3M17.5 4.5h3M20.5 9.5v2M19.5 10.5h2"/>',
  ripple: '<path d="M11 11v10l3-2.8 2 4.3 1.8-.8-2-4.3H20z"/><path d="M7.2 9.1a5 5 0 0 1 5.2-3.9"/><path d="M3.6 8.4a8.8 8.8 0 0 1 8.6-7"/>',
  edit: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.2 7.8 20 18M8.2 16.2 20 6"/>',
  silence: '<path d="M3 12h1.5M6 9v6M9 6v12M21 12h-1.5M18 9v6M15 6v12"/><path d="M11 12h2" stroke-dasharray="1 1.5"/>',
  captions: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M6 12.5h5M13 12.5h5M6 15.5h8M16 15.5h2"/>',
  annotate: '<rect x="3" y="3" width="11" height="8" rx="1.5" stroke-dasharray="2 2"/><path d="M13 21 20 14M20 14h-5M20 14v5"/><path d="M4 15h5v5H4z" fill="currentColor" opacity=".35"/>',
  background: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m3 17 5.5-5 4 3.5 3-2.5 5.5 4.5"/>',
  frame: '<path d="M4 7.5 17 4v14L4 16.5z"/><path d="M17 4l3 2v14l-3-2"/><path d="M7 10.5l7-1.5"/>',
  webcam: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="9.5" r="3"/><path d="M6.3 18.5a6.5 6.5 0 0 1 11.4 0"/>',
  export: '<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M4 13v6.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V13"/>',
  crop: '<path d="M6 2v16h16M2 6h16v16"/><path d="M14 10l-4 4"/>',
  terminal: '<rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="m6.5 9.5 3 2.5-3 2.5M11.5 15h6"/>'
}

const CARDS = [
  { id: 'auto-zoom', icon: 'zoom', title: 'Automatic zoom',
    text: ['Zooms toward every click and glides back', 'out, from the clicks recorded with the take.'], chips: BOTH },
  { id: 'cursor-free-capture', icon: 'capture', title: 'Cursor-free capture',
    text: ['Records Hyprland natively without the system', 'cursor, then draws a clean one on top.'], chips: [['Linux · Hyprland', 'ok']] },
  { id: 'cursor-styles', icon: 'cursor', title: 'Smooth cursor styles',
    text: pick(['A smoothed pointer as an arrow, dot, hand,', 'bobbing pointer or the Hermes knight.'], ['A smoothed pointer as an arrow, dot,', 'hand or bobbing pointer.']), chips: BOTH },
  { id: 'click-effects', icon: 'ripple', title: 'Clicks you can see',
    text: ['Ripples and bounce on every click, with soft', 'click and zoom sounds you can switch off.'], chips: BOTH },
  { id: 'edit', icon: 'edit', title: 'Cut and transition',
    text: ['Split at the playhead, remove what you', "don't need and smooth over every cut."], chips: BOTH },
  { id: 'silence-removal', icon: 'silence', title: 'Silence removal',
    text: ['Finds the quiet stretches in your voice track', 'and turns them into cuts you can review.'], chips: BOTH },
  { id: 'captions', icon: 'captions', title: 'Offline captions',
    text: ['Transcribed on your machine with whisper.cpp', 'and burned into the export. Nothing uploaded.'], chips: CAPTIONS },
  { id: 'annotations', icon: 'annotate', title: 'Blur, arrows and boxes',
    text: ['Pixelate secrets, point at what matters and', 'highlight a region, each with its own timing.'], chips: BOTH },
  { id: 'backgrounds', icon: 'background', title: 'Backgrounds and themes',
    text: pick(['Gradients, solids and images, plus Hermes and', 'Omarchy themes with their own lettering.'], ['Gradients, solids and your own images, plus', 'the Omarchy theme with its wordmark.']), chips: BOTH },
  { id: '3d-frame', icon: 'frame', title: '3D frame and mockups',
    text: ['Tilt the whole frame in perspective, or wrap', 'the take in a browser, window or phone.'], chips: BOTH },
  { id: 'webcam', icon: 'webcam', title: 'Webcam bubble',
    text: ['Background removal and studio lighting, and', 'it shrinks out of the way as the camera zooms.'], chips: BOTH },
  { id: 'crop-speed', icon: 'crop', title: 'Crop and speed',
    text: ['Crop by drawing on the frame, and speed dull', 'parts from 0.25× to 4× with pitch kept.'], chips: BOTH },
  { id: 'export', icon: 'export', title: 'Export anywhere',
    text: ['MP4 or GIF up to 2160p at 60 fps, in 16:9,', '9:16, 1:1 or the source shape.'], chips: BOTH },
  { id: 'cli', icon: 'terminal', title: 'Built for agents',
    text: ['Record, clip and export from the command', 'line, with JSON back for every command.'], chips: BOTH }
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function chipsSvg(chips) {
  let x = 44
  return chips.map(([label, tone]) => {
    const w = Math.round(label.length * 8.6 + 44)
    const fg = tone === 'ok' ? C.ok : C.soon
    const bg = tone === 'ok' ? C.okBg : C.soonBg
    const svg = `<g transform="translate(${x} 272)"><rect width="${w}" height="30" rx="15" fill="${bg}"/><circle cx="17" cy="15" r="4" fill="${fg}"/><text x="29" y="20" font-size="15" font-weight="600" fill="${fg}">${esc(label)}</text></g>`
    x += w + 10
    return svg
  }).join('')
}

function frame(inner, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.top}"/><stop offset="1" stop-color="${C.bottom}"/></linearGradient>
<radialGradient id="glow" cx="1" cy="0" r="0.9"><stop offset="0" stop-color="${C.accent}" stop-opacity=".16"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="28" fill="url(#g)" stroke="${C.edge}" stroke-width="2"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="28" fill="url(#glow)"/>
<g font-family="${FONT}">${inner}</g>
</svg>
`
}

function card(c) {
  const icon = `<g transform="translate(44 40)"><rect width="76" height="76" rx="20" fill="${C.tile}"/><g transform="translate(14 14) scale(2)" fill="none" stroke="${C.accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" color="${C.accent}">${ICONS[c.icon]}</g></g>`
  const title = `<text x="44" y="170" font-size="34" font-weight="700" fill="${C.ink}">${esc(c.title)}</text>`
  const text = c.text.map((line, i) => `<text x="44" y="${210 + i * 30}" font-size="20" fill="${C.muted}">${esc(line)}</text>`).join('')
  return frame(icon + title + text + chipsSvg(c.chips), `${c.title}: ${c.text.join(' ')}`)
}

const tagline = pick('Local, private and free, for Omarchy / Hyprland and Windows.', 'Local, private and free, for Omarchy / Hyprland.')

function heroCard() {
  const logo = `<image x="44" y="40" width="96" height="96" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${readFileSync(join(root, 'resources/icon-256.png')).toString('base64')}"/>`
  const inner = logo +
    `<text x="44" y="200" font-size="46" font-weight="800" fill="${C.accent}">ScreenPolish</text>` +
    `<text x="44" y="240" font-size="24" font-weight="600" fill="${C.ink}">Record. Polish. Export.</text>` +
    `<text x="44" y="296" font-size="18" fill="${C.muted}">${esc(tagline)}</text>`
  return frame(inner, `ScreenPolish: Record. Polish. Export. ${tagline}`)
}

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'screenpolish.svg'), heroCard())
for (const c of CARDS) writeFileSync(join(out, `${c.id}.svg`), card(c))
console.log(`Wrote ${CARDS.length + 1} ${PUBLIC ? 'public' : 'private'} cards to docs/images/features/`)
