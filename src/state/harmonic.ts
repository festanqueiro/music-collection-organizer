// Harmonic-mixing helpers: Camelot wheel notation for the analysed key,
// and "does this track mix with that one" checks. Pure — no store/DOM —
// so it's unit-testable and usable from both the table and the player.

export type KeyNotation = 'camelot' | 'musical' | 'both'

export interface ParsedKey {
  pitchClass: number // 0 = C … 11 = B
  mode: 'major' | 'minor'
}

export interface CamelotKey {
  number: number // 1..12
  letter: 'A' | 'B' // A = minor, B = major
  code: string // e.g. "8A"
}

const PITCH_CLASSES: Record<string, number> = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
}

// Sharps for most keys, flats where DJ software conventionally uses them.
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

// Accepts what the analysis pipeline stores ("A minor", "F# major") plus
// the short forms other tools use ("Am", "F#m", "Bbmaj", "C").
export function parseKey(value: string | null | undefined): ParsedKey | null {
  if (!value) return null
  const match = /^\s*([A-Ga-g])([#b♯♭]?)\s*(major|minor|maj|min|m)?\s*$/i.exec(value.trim())
  if (!match) return null
  const [, letter, accidentalRaw, modeRaw] = match
  const accidental = accidentalRaw === '♯' ? '#' : accidentalRaw === '♭' ? 'b' : accidentalRaw
  const name = letter.toUpperCase() + accidental
  const pitchClass = PITCH_CLASSES[name]
  if (pitchClass === undefined) return null
  const modeText = (modeRaw ?? '').toLowerCase()
  // A bare "m" means minor; "M"/"maj"/"major" or nothing means major.
  const mode = modeText === 'minor' || modeText === 'min' || modeRaw === 'm' ? 'minor' : 'major'
  return { pitchClass, mode }
}

// Each step round the circle of fifths (+7 semitones) is +1 on the wheel;
// 8A is A minor and 8B is C major.
export function toCamelot(value: string | null | undefined): CamelotKey | null {
  const key = parseKey(value)
  if (!key) return null
  const offset = key.mode === 'minor' ? 5 : 8
  const number = (key.pitchClass * 7 + offset) % 12 || 12
  const letter = key.mode === 'minor' ? 'A' : 'B'
  return { number, letter, code: `${number}${letter}` }
}

// "Am", "F#", "Bbm" — the compact form most DJ software shows.
export function shortKeyName(value: string | null | undefined): string | null {
  const key = parseKey(value)
  if (!key) return null
  return key.mode === 'minor' ? `${MINOR_NAMES[key.pitchClass]}m` : MAJOR_NAMES[key.pitchClass]
}

export function formatKey(value: string | null | undefined, notation: KeyNotation): string | null {
  if (!value) return null
  const camelot = toCamelot(value)
  const short = shortKeyName(value)
  if (!camelot || !short) return value
  if (notation === 'camelot') return camelot.code
  if (notation === 'musical') return short
  return `${camelot.code} · ${short}`
}

// Sort order for the Key column: round the wheel, minor before major at
// each position. Unknown keys sort last.
export function keySortValue(value: string | null | undefined): number {
  const camelot = toCamelot(value)
  if (!camelot) return 99
  return camelot.number * 2 + (camelot.letter === 'A' ? 0 : 1)
}

// Standard harmonic-mixing moves: the same key, one step either way round
// the wheel (same letter), or the relative major/minor (same number).
export function areKeysCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = toCamelot(a)
  const kb = toCamelot(b)
  if (!ka || !kb) return false
  if (ka.number === kb.number) return true
  if (ka.letter !== kb.letter) return false
  const diff = Math.abs(ka.number - kb.number)
  return diff === 1 || diff === 11
}

// Within ±tolerance of the other BPM, also allowing half/double time (a
// 70 BPM dub track mixes with 140 BPM).
export function areBpmsCompatible(
  a: number | null | undefined,
  b: number | null | undefined,
  tolerance = 0.06
): boolean {
  if (!a || !b) return false
  return [b, b * 2, b / 2].some((target) => Math.abs(a - target) / target <= tolerance)
}

// One hue per wheel position, so neighbouring (compatible) keys get
// neighbouring colours. A (minor) is a little darker than B (major).
export function camelotColor(camelot: CamelotKey): string {
  const hue = ((camelot.number - 1) * 30 + 200) % 360
  const lightness = camelot.letter === 'A' ? 38 : 46
  return `hsl(${hue}, 55%, ${lightness}%)`
}
