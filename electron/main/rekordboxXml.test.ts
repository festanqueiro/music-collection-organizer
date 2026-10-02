import { describe, it, expect } from 'vitest'
import { decodeRekordboxText, locationToPath, parseM3u, parseM3uEntries, parseRekordboxTxt, parseRekordboxXml } from './rekordboxXml'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="2">
    <TRACK TrackID="1" Name="A" Artist="Dubkasm" Size="1234" TotalTime="245" Location="file://localhost/Users/me/Music/A%20B%20&amp;%20C.aiff">
      <TEMPO Inizio="0" Bpm="140" />
    </TRACK>
    <TRACK TrackID="2" Name="B" Location="file://localhost/Users/me/Music/Cafe%CC%81.wav" />
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="2">
      <NODE Type="0" Name="Sets" Count="2">
        <NODE Name="Bassin" Type="1" KeyType="0" Entries="2">
          <TRACK Key="2" /><TRACK Key="1" />
        </NODE>
        <NODE Type="0" Name="Empty" Count="0" />
      </NODE>
      <NODE Name="By location" Type="1" KeyType="1" Entries="1">
        <TRACK Key="file://localhost/Users/me/Music/Cafe%CC%81.wav" />
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>`

describe('rekordbox exports', () => {
  it('reads the playlist tree from the XML, songs as NFC paths', () => {
    expect(parseRekordboxXml(XML)).toEqual([
      {
        kind: 'folder',
        name: 'Sets',
        children: [
          {
            kind: 'playlist',
            name: 'Bassin',
            paths: ['/Users/me/Music/Café.wav', '/Users/me/Music/A B & C.aiff'],
            // What the COLLECTION says about each song, for finding it elsewhere.
            hints: [
              { size: undefined, duration: undefined, title: 'B', artist: undefined },
              { size: 1234, duration: 245, title: 'A', artist: 'Dubkasm' },
            ],
          },
          { kind: 'folder', name: 'Empty', children: [] },
        ],
      },
      { kind: 'playlist', name: 'By location', paths: ['/Users/me/Music/Café.wav'], hints: [{}] },
    ])
    expect(() => parseRekordboxXml('<html/>')).toThrow()
  })

  it('turns Windows locations into Windows paths', () => {
    expect(locationToPath('file://localhost/C:/Music/a%20b.mp3')).toBe('C:\\Music\\a b.mp3')
  })

  it('reads a UTF-16 text export by its header', () => {
    const text = '#\tArtwork\tTrack Title\tArtist\tBPM\n1\t\tHornsman\tKing Earthquake\t113.02\n'
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    expect(parseRekordboxTxt(decodeRekordboxText(buffer))).toEqual([{ title: 'Hornsman', artist: 'King Earthquake', path: undefined }])
    expect(() => parseRekordboxTxt('#\tBPM\n1\t120')).toThrow()
  })

  it('reads m3u8 paths, skipping comments', () => {
    expect(parseM3u('#EXTM3U\n#EXTINF:234,A - B\n/Users/me/a.aiff\r\nfile://localhost/Users/me/b%20c.wav\n')).toEqual([
      '/Users/me/a.aiff',
      '/Users/me/b c.wav',
    ])
  })

  it("keeps each m3u8 song's #EXTINF length, artist and title", () => {
    expect(parseM3uEntries('#EXTM3U\n#EXTINF:234,Dubkasm - Kings Music - Part 2\n/Volumes/USB/a.aiff\n/Volumes/USB/b.wav\n#EXTINF:-1,Untitled\nc.mp3')).toEqual([
      { path: '/Volumes/USB/a.aiff', hint: { duration: 234, artist: 'Dubkasm', title: 'Kings Music - Part 2' } },
      { path: '/Volumes/USB/b.wav', hint: {} },
      { path: 'c.mp3', hint: { duration: undefined, artist: undefined, title: 'Untitled' } },
    ])
  })
})
