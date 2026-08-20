export function computeWaveformPeaks(pcm: Float32Array, peakCount = 800): number[] {
  const peaks: number[] = []
  const samplesPerPeak = Math.max(1, Math.floor(pcm.length / peakCount))
  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak
    const end = Math.min(start + samplesPerPeak, pcm.length)
    let max = 0
    for (let j = start; j < end; j++) {
      const abs = Math.abs(pcm[j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }
  return peaks
}
