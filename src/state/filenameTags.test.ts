import { describe, it, expect } from 'vitest'
import { guessTagsFromFilename } from './filenameTags'

const guess = (filename: string) => guessTagsFromFilename(filename)

describe('guessTagsFromFilename', () => {
  it('Artist - Title', () => {
    expect(guess('Photek - Age Of Empires.aiff')).toEqual({ artist: 'Photek', title: 'Age Of Empires', album: null })
    expect(guess('Special Request x Tim Reaper - Pull Up (Tim Reaper Remix).aiff')).toEqual({
      artist: 'Special Request x Tim Reaper',
      title: 'Pull Up (Tim Reaper Remix)',
      album: null,
    })
  })

  it('a leading track number', () => {
    expect(guess('01 - La Dame feat. Killa P - If Ah War.wav')).toEqual({
      artist: 'La Dame feat. Killa P',
      title: 'If Ah War',
      album: null,
    })
  })

  it('Bandcamp: Artist - Album - NN Title', () => {
    expect(guess('Yosh - Fragments EP - 02 Inverted.aiff')).toEqual({ artist: 'Yosh', title: 'Inverted', album: 'Fragments EP' })
    expect(guess('Dubkasm - CM4400 EP - Dubkasm meets Iration Steppas - 08 Higher Realm.aiff')).toEqual({
      artist: 'Dubkasm',
      title: 'Higher Realm',
      album: 'CM4400 EP - Dubkasm meets Iration Steppas',
    })
  })

  it('drops the artist repeated before the title', () => {
    expect(guess('JD. REID - EDITS 4 - 09 JD. REID - RED-TYPE ROOM (HIATUS KAIYOTE + JO).aiff')).toEqual({
      artist: 'JD. REID',
      title: 'RED-TYPE ROOM (HIATUS KAIYOTE + JO)',
      album: 'EDITS 4',
    })
    expect(guess('ILL_K - ILL_K - Herb Dub.aiff')).toEqual({ artist: 'ILL_K', title: 'Herb Dub', album: null })
  })

  it('vinyl side markers', () => {
    expect(guess('Mystic Fyah - DUBCOM008V - A1 - Mystic Fyah - Righteous.aiff')).toEqual({
      artist: 'Mystic Fyah',
      title: 'Righteous',
      album: 'DUBCOM008V',
    })
    expect(guess('Breaka - Swinging Flavors #7 - 02 B1. Damn Hot (Danny Scrilla Remix).aiff').title).toBe(
      'Damn Hot (Danny Scrilla Remix)'
    )
  })

  it('underscores and unspaced hyphens', () => {
    expect(guess('6-Rhythm___Sound_-_Music_Hit_You.aif')).toEqual({ artist: 'Rhythm Sound', title: 'Music Hit You', album: null })
    expect(guess('Ishan_Sound-Red.wav')).toEqual({ artist: 'Ishan Sound', title: 'Red', album: null })
  })

  it('strips store ids and mastering noise', () => {
    expect(guess("4101199_Planetary Funk Alert_(Original 12'' Mix).aiff").title).toBe("Planetary Funk Alert (Original 12'' Mix)")
    expect(guess('Akcept - Moonlight (ft Tailored Sound)_SC_Master_1644.wav').title).toBe('Moonlight (ft Tailored Sound)')
    expect(guess('Freud - Nightsky (Versa Remix)_DM_Master_Loud.wav')).toEqual({
      artist: 'Freud',
      title: 'Nightsky (Versa Remix)',
      album: null,
    })
    expect(guess('LEMON&MINT - FREAK ON (LEMON & MINT MIX) Master.wav').title).toBe('FREAK ON (LEMON & MINT MIX)')
    expect(guess('Lucent - Topper Top (Funky Flip) -Free DL-.aiff').title).toBe('Topper Top (Funky Flip)')
  })

  it('a bare title', () => {
    expect(guess('Untitled.wav')).toEqual({ artist: null, title: 'Untitled', album: null })
  })
})
