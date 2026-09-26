// Guesses a track's artist / title (and album, for release downloads) from
// its filename, for suggesting ID3 tags. Handles the usual shapes:
//
//   Artist - Title.aiff
//   01 - Artist - Title.wav
//   Artist - Album - 03 Title.aiff        (Bandcamp downloads)
//   Artist - Album - 03 Artist - Title.aiff
//   Artist_-_Title.aif / Artist_Name-Title.wav
//
// and drops the noise producers and stores leave in names (Beatport ids,
// "Master", "_DM_Master_Loud", "-Free DL-"). It's a guess: the user
// reviews it before anything is written.

export interface FilenameTagGuess {
  artist: string | null
  title: string | null
  album: string | null
}

const NOISE_WORDS = /^(master|mastered|premaster|mstr\d*|final|loud|dm|sc|\d+bit|v\d+|(16|24)(44|48|96))$/i

function clean(text: string): string {
  return text
    .replace(/\s*[-[(]\s*free\s*(dl|download)\s*[-\])]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTrailingNoise(base: string): string {
  // Trailing words like "_DM_Master_Loud" or " Master".
  const words = base.split(/([_\s]+)/)
  while (words.length > 2 && NOISE_WORDS.test(words[words.length - 1])) words.splice(-2, 2)
  return words.join('')
}

const TRACK_NUMBER = /^(\d{1,3})(?:\s*[.)-]\s*|\s+)(?=\S)/
// A vinyl side/position ("A1", "B2.", "AA") before a title.
const SIDE = /^[A-D]{1,2}\d{0,2}[.)]?(?:\s+|$)/

// A part that marks where the title starts: "03 Title", "A1", "B2. Title".
function isTrackMarker(part: string): boolean {
  return TRACK_NUMBER.test(part) || /^[A-D]{1,2}\d{0,2}[.)]?$/.test(part) || /^[A-D]{1,2}\d{1,2}[.)]?\s/.test(part)
}

function stripTrackMarker(part: string): string {
  return part.replace(TRACK_NUMBER, '').replace(SIDE, '')
}

export function guessTagsFromFilename(filename: string): FilenameTagGuess {
  let base = filename.replace(/\.[a-z0-9]{2,5}$/i, '')
  base = stripTrailingNoise(base)
  // A store's numeric id ("12345_Title_(Original Mix)"): the rest is
  // underscore-separated too.
  const storeId = /^\d{5,}_/.test(base)
  base = base.replace(/^\d{5,}_/, '')
  // Underscores as spaces — unless the name already has spaces, where an
  // underscore is more likely part of a name ("ILL_K").
  if (storeId || !base.includes(' ')) base = base.replace(/_-_/g, ' - ').replace(/_+/g, ' ')
  base = clean(base).replace(TRACK_NUMBER, '')

  let parts = base.split(/\s+[-–—]\s+/).map(clean).filter(Boolean)
  // "Artist-Title" with no spaces around a single hyphen.
  if (parts.length === 1 && (parts[0].match(/-/g) ?? []).length === 1) {
    parts = parts[0].split('-').map(clean).filter(Boolean)
  }
  if (parts.length === 0) return { artist: null, title: null, album: null }
  if (parts.length === 1) return { artist: null, title: parts[0], album: null }

  const artist = parts[0]
  // A later part starting with a track number is where the title starts;
  // anything between the artist and it is the album.
  const numbered = parts.findIndex((part, i) => i > 0 && isTrackMarker(part))
  if (numbered > 0) {
    const album = parts.slice(1, numbered).join(' - ') || null
    let titleParts = [stripTrackMarker(parts[numbered]), ...parts.slice(numbered + 1)].filter(Boolean)
    // "03 Artist - Title": the track's own artist repeated before the title.
    if (titleParts.length > 1 && titleParts[0].toLowerCase() === artist.toLowerCase()) titleParts = titleParts.slice(1)
    return { artist, title: titleParts.join(' - '), album }
  }
  // "Artist - Artist - Title"
  const rest = parts[1].toLowerCase() === artist.toLowerCase() && parts.length > 2 ? parts.slice(2) : parts.slice(1)
  return { artist, title: rest.join(' - '), album: null }
}
