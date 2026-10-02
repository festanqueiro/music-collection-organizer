// The Rekordbox sync's phase 0 (docs/features/rekordbox-sync.md): from the
// user's own collection export, a small XML that changes three of their
// real tracks in known ways, to import into Rekordbox and see what it
// overwrites. Run with `npm run rekordbox:probe` (scripts/rekordbox-probe.ts);
// the checklist is docs/research/rekordbox-xml-import.md.
//
// Self-contained (no imports) so Node can run it straight from the .ts
// file with --experimental-strip-types.

export interface ProbeTrack {
  role: 'A' | 'B' | 'C'
  trackId: string
  name: string
  location: string
  changes: string[]
}

export interface Probe {
  xml: string
  tracks: ProbeTrack[]
  playlists: string[]
}

interface TrackBlock {
  text: string
  attrs: Record<string, string>
  marks: Record<string, string>[]
}

const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g
const attrsOf = (text: string): Record<string, string> => Object.fromEntries([...text.matchAll(attrRe)].map((m) => [m[1], m[2]]))
const esc = (v: string) => v.replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/gi, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
const unesc = (v: string) =>
  v.replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!)

// COLLECTION's TRACK elements, raw, with their attributes and cue marks.
function collectionTracks(xml: string): TrackBlock[] {
  const start = xml.indexOf('<COLLECTION')
  const end = xml.indexOf('</COLLECTION>')
  if (start < 0 || end < 0) throw new Error("This isn't a Rekordbox collection export (no COLLECTION)")
  const body = xml.slice(start, end)
  const out: TrackBlock[] = []
  for (const m of body.matchAll(/<TRACK\b([^>]*?)(\/>|>([\s\S]*?)<\/TRACK>)/g)) {
    const attrs = attrsOf(m[1])
    if (!attrs.TrackID || !attrs.Location) continue
    const marks = [...(m[3] ?? '').matchAll(/<POSITION_MARK\b([^>]*?)\/?>/g)].map((p) => attrsOf(p[1]))
    out.push({ text: m[0], attrs, marks })
  }
  return out
}

function firstPlaylistName(xml: string): string | null {
  for (const m of xml.matchAll(/<NODE\b([^>]*?)>/g)) {
    const a = attrsOf(m[1])
    if (a.Type === '1' && a.Name) return unesc(a.Name)
  }
  return null
}

const setAttr = (tag: string, name: string, value: string) =>
  new RegExp(`\\b${name}="[^"]*"`).test(tag) ? tag.replace(new RegExp(`\\b${name}="[^"]*"`), `${name}="${esc(value)}"`) : tag.replace(/^<TRACK\b/, `<TRACK ${name}="${esc(value)}"`)

const mark = (num: number, start: number, rgb: [number, number, number], type = 0, end?: number) =>
  `      <POSITION_MARK Name="" Type="${type}" Start="${start.toFixed(3)}"${end !== undefined ? ` End="${end.toFixed(3)}"` : ''} Num="${num}" Red="${rgb[0]}" Green="${rgb[1]}" Blue="${rgb[2]}"/>`

// Rebuilds a TRACK with new attributes and cue marks, keeping its TEMPO.
function rebuild(block: TrackBlock, attrs: Record<string, string>, marks: string[]): string {
  let open = block.text.match(/^<TRACK\b[^>]*?(?=\/?>)/)![0]
  for (const [k, v] of Object.entries(attrs)) open = setAttr(open, k, v)
  const tempos = [...block.text.matchAll(/<TEMPO\b[^>]*?\/>/g)].map((m) => `      ${m[0]}`)
  return [`    ${open}>`, ...tempos, ...marks, '    </TRACK>'].join('\n')
}

const isLossless = (t: TrackBlock) => /AIFF|WAV|FLAC/i.test(t.attrs.Kind ?? '')
const hotCues = (t: TrackBlock) => t.marks.filter((m) => m.Type === '0' && Number(m.Num) >= 0)
const seconds = (t: TrackBlock) => Number(t.attrs.TotalTime ?? 0)

// A: a lossless track with at least two hot cues — change its info, move
// and recolour cue A, add cue H. B: a lossless track with no cues — add hot
// cues, a memory cue and a loop. C: an MP3 with a hot cue — copy cue A to
// slot F at the same time, to see if MP3 cue times shift on import.
export function makeProbe(collectionXml: string): Probe {
  const tracks = collectionTracks(collectionXml).filter((t) => seconds(t) >= 60)
  const a = tracks.find((t) => isLossless(t) && hotCues(t).length >= 2)
  const b = tracks.find((t) => isLossless(t) && t.marks.length === 0 && t !== a)
  const c = tracks.find((t) => /MP3/i.test(t.attrs.Kind ?? '') && hotCues(t).length >= 1)
  if (!a || !b) throw new Error('Need a lossless track with 2+ hot cues and one with none (60 s or longer)')

  const out: ProbeTrack[] = []
  const blocks: string[] = []

  {
    const name = unesc(a.attrs.Name ?? '')
    const bpm = Number(a.attrs.AverageBpm ?? 0)
    const keep = a.marks.filter((m) => m.Num !== '0').map((m) => {
      const rgb: [number, number, number] = [Number(m.Red ?? 0), Number(m.Green ?? 0), Number(m.Blue ?? 0)]
      return mark(Number(m.Num), Number(m.Start), rgb, Number(m.Type), m.End !== undefined ? Number(m.End) : undefined)
    })
    const cueA = hotCues(a).find((m) => m.Num === '0') ?? hotCues(a)[0]
    const movedA = Number(cueA.Start) + 1
    blocks.push(
      rebuild(
        a,
        {
          Name: `${name} [MCO probe]`,
          Genre: 'MCO Probe Genre',
          Comments: `${unesc(a.attrs.Comments ?? '')}${a.attrs.Comments ? ' · ' : ''}MCO probe comment`,
          AverageBpm: (bpm + 1).toFixed(2),
          Tonality: a.attrs.Tonality === 'Am' ? 'Em' : 'Am',
        },
        [...keep, mark(0, movedA, [0, 224, 255]), mark(7, 30, [255, 18, 123])]
      )
    )
    out.push({
      role: 'A',
      trackId: a.attrs.TrackID,
      name,
      location: a.attrs.Location,
      changes: [
        `Title → "${name} [MCO probe]"`,
        'Genre → "MCO Probe Genre"',
        'Comments: " · MCO probe comment" added',
        `BPM ${bpm.toFixed(2)} → ${(bpm + 1).toFixed(2)}`,
        `Key ${a.attrs.Tonality ?? '?'} → ${a.attrs.Tonality === 'Am' ? 'Em' : 'Am'}`,
        `Hot cue A moved ${Number(cueA.Start).toFixed(3)} s → ${movedA.toFixed(3)} s and turned cyan`,
        'Hot cue H added at 30.000 s (pink)',
      ],
    })
  }
  {
    blocks.push(
      rebuild(b, {}, [
        mark(0, 10, [40, 226, 20]),
        mark(1, 20, [69, 172, 219]),
        mark(-1, 5, [255, 55, 111]),
        mark(-1, 40, [255, 55, 111], 4, 44),
      ])
    )
    out.push({
      role: 'B',
      trackId: b.attrs.TrackID,
      name: unesc(b.attrs.Name ?? ''),
      location: b.attrs.Location,
      changes: ['Hot cue A at 10.000 s (green)', 'Hot cue B at 20.000 s (blue)', 'Memory cue at 5.000 s', 'Memory loop 40.000–44.000 s'],
    })
  }
  if (c) {
    const cue = hotCues(c)[0]
    const freeSlot = [5, 6, 4, 3, 7].find((n) => !c.marks.some((m) => Number(m.Num) === n)) ?? 5
    const keep = c.marks.map((m) =>
      mark(Number(m.Num), Number(m.Start), [Number(m.Red ?? 0), Number(m.Green ?? 0), Number(m.Blue ?? 0)], Number(m.Type), m.End !== undefined ? Number(m.End) : undefined)
    )
    blocks.push(rebuild(c, {}, [...keep, mark(freeSlot, Number(cue.Start), [255, 255, 255])]))
    out.push({
      role: 'C',
      trackId: c.attrs.TrackID,
      name: unesc(c.attrs.Name ?? ''),
      location: c.attrs.Location,
      changes: [
        `Hot cue ${'ABCDEFGH'[freeSlot]} added (white) at exactly hot cue ${'ABCDEFGH'[Number(cue.Num)]}'s time, ${Number(cue.Start).toFixed(3)} s — if they don't line up after import, MP3 cue times shift`,
      ],
    })
  }

  const ids = out.map((t) => t.trackId)
  const existing = firstPlaylistName(collectionXml)
  const playlists = ['MCO Probe']
  const nodes = [
    `      <NODE Name="MCO Probe" Type="1" KeyType="0" Entries="${ids.length}">`,
    ...ids.map((id) => `        <TRACK Key="${id}"/>`),
    '      </NODE>',
  ]
  if (existing) {
    playlists.push(existing)
    nodes.push(`      <NODE Name="${esc(existing)}" Type="1" KeyType="0" Entries="1">`, `        <TRACK Key="${ids[0]}"/>`, '      </NODE>')
  }
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    '  <PRODUCT Name="MCO probe" Version="1" Company=""/>',
    `  <COLLECTION Entries="${blocks.length}">`,
    ...blocks,
    '  </COLLECTION>',
    '  <PLAYLISTS>',
    `    <NODE Type="0" Name="ROOT" Count="${playlists.length}">`,
    ...nodes,
    '    </NODE>',
    '  </PLAYLISTS>',
    '</DJ_PLAYLISTS>',
    '',
  ].join('\n')
  return { xml, tracks: out, playlists }
}

// Two collection exports: are TrackIDs the same for the same file?
export function compareTrackIds(first: string, second: string): { same: number; changed: number; onlyFirst: number; onlySecond: number } {
  const map = (xml: string) => new Map(collectionTracks(xml).map((t) => [t.attrs.Location, t.attrs.TrackID]))
  const a = map(first)
  const b = map(second)
  let same = 0
  let changed = 0
  let onlyFirst = 0
  for (const [loc, id] of a) {
    if (!b.has(loc)) onlyFirst++
    else if (b.get(loc) === id) same++
    else changed++
  }
  const onlySecond = [...b.keys()].filter((loc) => !a.has(loc)).length
  return { same, changed, onlyFirst, onlySecond }
}
