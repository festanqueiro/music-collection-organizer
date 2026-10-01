import { describe, it, expect } from 'vitest'
import { makeProbe, compareTrackIds } from './rekordboxProbe'
import { parseRekordboxXml } from './rekordboxXml'

const track = (id: number, kind: string, marks = '', extra = '') =>
  `<TRACK TrackID="${id}" Name="Song ${id}" Artist="A" Genre="" Kind="${kind}" TotalTime="240" AverageBpm="140.00" Tonality="Fm" Comments="Visit x" ${extra}Location="file://localhost/m/${id}.aiff">
      <TEMPO Inizio="0.1" Bpm="140.00" Metro="4/4" Battito="1"/>${marks}
    </TRACK>`
const cue = (num: number, start: number, type = 0) => `\n      <POSITION_MARK Name="" Type="${type}" Start="${start.toFixed(3)}" Num="${num}" Red="255" Green="55" Blue="111"/>`

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="4">
    ${track(1, 'AIFF File', cue(0, 12.5) + cue(1, 40) + cue(-1, 2))}
    ${track(2, 'WAV File')}
    ${track(3, 'MP3 File', cue(0, 8.25))}
    <TRACK TrackID="4" Name="Short" Kind="AIFF File" TotalTime="20" Location="file://localhost/m/4.aiff"/>
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="Sets &amp; More" Type="1" KeyType="0" Entries="1"><TRACK Key="2"/></NODE></NODE></PLAYLISTS>
</DJ_PLAYLISTS>`

describe('rekordbox probe', () => {
  it('changes three real tracks in known ways and adds two playlists', () => {
    const probe = makeProbe(XML)
    expect(probe.tracks.map((t) => [t.role, t.trackId])).toEqual([
      ['A', '1'],
      ['B', '2'],
      ['C', '3'],
    ])
    const x = probe.xml
    expect(x).toContain('Name="Song 1 [MCO probe]"')
    expect(x).toContain('Genre="MCO Probe Genre"')
    expect(x).toContain('Comments="Visit x · MCO probe comment"')
    expect(x).toContain('AverageBpm="141.00"')
    // A: cue A moved by 1 s and recoloured, B and the memory cue kept, H added.
    expect(x).toContain('Start="13.500" Num="0" Red="0" Green="224" Blue="255"')
    expect(x).toContain('Start="40.000" Num="1"')
    expect(x).toContain('Start="2.000" Num="-1"')
    expect(x).toContain('Start="30.000" Num="7"')
    // B: two hot cues, a memory cue, a memory loop.
    expect(x).toContain('Type="4" Start="40.000" End="44.000" Num="-1"')
    // C: a copy of cue A at the same time in a free slot.
    expect(x).toMatch(/Start="8\.250" Num="5" Red="255" Green="255" Blue="255"/)
    expect(probe.playlists).toEqual(['MCO Probe', 'Sets & More'])
    // MCO's own importer reads it back: the playlists with the tracks' paths.
    const tree = parseRekordboxXml(x)
    expect(tree.map((n) => [n.name, n.kind === 'playlist' ? n.paths.length : -1])).toEqual([
      ['MCO Probe', 3],
      ['Sets & More', 1],
    ])
  })

  it('refuses a collection without the tracks it needs', () => {
    expect(() => makeProbe(XML.replace(cue(1, 40), ''))).toThrow(/2\+ hot cues/)
  })

  it('compares TrackIDs between two exports by file', () => {
    const second = XML.replace('TrackID="2"', 'TrackID="22"').replace(/<TRACK TrackID="4"[^>]*\/>/, '')
    expect(compareTrackIds(XML, second)).toEqual({ same: 2, changed: 1, onlyFirst: 1, onlySecond: 0 })
  })
})
