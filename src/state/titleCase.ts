// A Title or Artist typed ALL IN CAPITALS ("BOOZOO BAJOU"), and the same
// words with normal capitals ("Boozoo Bajou"), for suggesting a fix in the
// ID3 tags section. A suggestion only: the user reviews it before anything
// is written (ADR 0028).

// Short names that are usually all capitals on purpose ("ABBA", "MGMT",
// "AC/DC") aren't flagged: only a value with two or more words, or one
// word of six letters or more.
export function isAllUppercase(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? []
  if (letters.length === 0 || text !== text.toUpperCase() || text === text.toLowerCase()) return false
  const words = text.split(/\s+/).filter((w) => /\p{L}/u.test(w))
  return words.length >= 2 || letters.length >= 6
}

// Kept in capitals: abbreviations and Roman numerals.
const KEEP_UPPER = new Set(['DJ', 'MC', 'UK', 'US', 'USA', 'NYC', 'LA', 'EP', 'LP', 'VIP', 'AKA', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII'])
// Kept in lower case unless they start the text.
const KEEP_LOWER = new Set(['feat.', 'ft.', 'vs.', 'vs', 'x'])

export function toTitleCase(text: string): string {
  return text
    .split(/(\s+)/)
    .map((word, i) => {
      if (/^\s+$/.test(word)) return word
      // Brackets and quotes around a word: "(ORIGINAL" → "(Original".
      const [, lead, core, trail] = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}.]*)$/u.exec(word) ?? ['', '', word, '']
      if (KEEP_UPPER.has(core.replace(/\.$/, ''))) return lead + core + trail
      const lower = core.toLowerCase()
      if (i > 0 && KEEP_LOWER.has(lower)) return lead + lower + trail
      // A capital after a hyphen or slash too ("JAY-Z" → "Jay-Z"), not after
      // an apostrophe ("DON'T" → "Don't").
      return lead + lower.replace(/(^|[-/])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase()) + trail
    })
    .join('')
}
