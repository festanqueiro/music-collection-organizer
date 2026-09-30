import { describe, it, expect } from 'vitest'
import { decodeRekordboxText, locationToPath, parseM3u, parseRekordboxTxt, parseRekordboxXml } from './rekordboxXml'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="2">
    <TRACK TrackID="1" Name="A" Location="file://localhost/Users/me/Music/A%20B%20&amp;%20C.aiff">
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
          { kind: 'playlist', name: 'Bassin', paths: ['/Users/me/Music/Café.wav', '/Users/me/Music/A B & C.aiff'] },
          { kind: 'folder', name: 'Empty', children: [] },
        ],
      },
      { kind: 'playlist', name: 'By location', paths: ['/Users/me/Music/Café.wav'] },
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
})
