// Text compared the way a person would: "cafe" finds "Café".

// Lower case, without accents (the combining marks U+0300 to U+036F that a
// decomposed "é" carries).
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
