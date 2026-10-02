// Phase 0 of the Rekordbox sync: makes the probe XML from your collection
// export, or compares two exports' TrackIDs. See
// docs/research/rekordbox-xml-import.md for the whole checklist.
//
//   npm run rekordbox:probe -- ~/Desktop/Collection.xml ~/Desktop/mco-probe.xml
//   npm run rekordbox:probe -- --compare first.xml second.xml
import { readFileSync, writeFileSync } from 'node:fs'
import { makeProbe, compareTrackIds } from '../electron/main/rekordboxProbe.ts'

const args = process.argv.slice(2)
if (args[0] === '--compare' && args.length === 3) {
  const r = compareTrackIds(readFileSync(args[1], 'utf8'), readFileSync(args[2], 'utf8'))
  console.log(`Same file, same TrackID: ${r.same}`)
  console.log(`Same file, different TrackID: ${r.changed}`)
  console.log(`Only in the first: ${r.onlyFirst} · only in the second: ${r.onlySecond}`)
  console.log(r.changed === 0 ? '→ TrackIDs look stable between exports.' : '→ TrackIDs change between exports: MCO must not rely on them.')
} else if (args.length === 2) {
  const probe = makeProbe(readFileSync(args[0], 'utf8'))
  writeFileSync(args[1], probe.xml)
  console.log(`Wrote ${args[1]}\n`)
  for (const t of probe.tracks) {
    console.log(`Track ${t.role}: ${t.name}  (TrackID ${t.trackId})`)
    for (const c of t.changes) console.log(`   - ${c}`)
  }
  console.log(`\nPlaylists: ${probe.playlists.map((p) => `"${p}"`).join(', ')}`)
  console.log('\nNow follow docs/research/rekordbox-xml-import.md.')
} else {
  console.log('Usage: npm run rekordbox:probe -- <collection.xml> <probe.xml>\n       npm run rekordbox:probe -- --compare <first.xml> <second.xml>')
  process.exit(1)
}
