// MCO's tempos against a Rekordbox collection export, read-only:
//
//   npm run bpm:compare -- ~/Documents/exportCollection.xml
//   npm run bpm:compare -- export.xml "/path/to/collection.db"
//
// Without a database it reads the BETA app's, then the released app's.
// Prints how many songs agree, how many are out by a known ratio, and the
// songs that are — the ones Refine BPM, or importing Rekordbox's BPM, fixes.
// Numbers and method: docs/research/bpm-accuracy.md.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { decodeRekordboxText, readRekordboxCollection } from '../electron/main/rekordboxXml.ts'
import { compareBpms, type BpmVerdict } from '../electron/main/bpmCompare.ts'

const [xml, dbArg] = process.argv.slice(2)
if (!xml) {
  console.error('Usage: npm run bpm:compare -- <rekordbox collection.xml> [collection.db]')
  process.exit(1)
}
const support = join(homedir(), 'Library', 'Application Support')
const dbPath = dbArg ?? [join(support, 'v1-library-organizer-beta', 'collection.db'), join(support, 'music-collection-organizer', 'collection.db')].find(existsSync)
if (!dbPath || !existsSync(dbPath)) {
  console.error('No collection.db found: pass its path as the second argument')
  process.exit(1)
}

const db = new DatabaseSync(dbPath, { readOnly: true })
const mco = db.prepare('SELECT path, bpm FROM tracks WHERE present = 1').all() as { path: string; bpm: number | null }[]
db.close()
const rekordbox = readRekordboxCollection(decodeRekordboxText(readFileSync(xml))).tracks
const { compared, counts, onlyMco, onlyRekordbox } = compareBpms(mco, rekordbox)

console.log(`MCO: ${dbPath}\nRekordbox: ${xml}\n`)
console.log(`${compared.length} songs with a BPM on both sides (${onlyMco} only in MCO, ${onlyRekordbox} only in Rekordbox)\n`)
const labels: Record<BpmVerdict, string> = {
  same: 'the same (within 0.05)',
  close: 'within 1 %',
  'two-thirds': "MCO has two thirds of Rekordbox's",
  half: "MCO has half of Rekordbox's",
  double: "MCO has twice Rekordbox's",
  'three-halves': "MCO has one and a half times Rekordbox's",
  other: 'something else',
}
for (const verdict of Object.keys(labels) as BpmVerdict[]) {
  const share = compared.length ? ((counts[verdict] / compared.length) * 100).toFixed(1) : '0.0'
  console.log(`${String(counts[verdict]).padStart(6)}  ${share.padStart(5)} %  ${labels[verdict]}`)
}
for (const verdict of ['two-thirds', 'half', 'double', 'three-halves', 'other'] as BpmVerdict[]) {
  const rows = compared.filter((c) => c.verdict === verdict)
  if (rows.length === 0) continue
  console.log(`\n${labels[verdict]}:`)
  for (const c of rows) console.log(`  ${c.mco.toFixed(2).padStart(7)}  ${c.rekordbox.toFixed(2).padStart(7)}  ${basename(c.path)}`)
}
