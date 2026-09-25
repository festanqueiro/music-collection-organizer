// The current track's AnalyserNode, read by the visualizers (the
// full-screen overlay and the cast stream). Player.tsx remounts per track
// (and so does its EffectsChain/AnalyserNode), while a visualizer keeps
// running across track changes — it re-reads this every frame instead of
// capturing one node. Deliberately a plain module variable, not zustand
// state: nothing should re-render when it changes, and the render loops
// poll it anyway. The band/beat analysis itself lives in the
// threejs-visualisers package.
let activeAnalyser: AnalyserNode | null = null

export function setActiveAnalyser(analyser: AnalyserNode | null): void {
  activeAnalyser = analyser
}

export function getActiveAnalyser(): AnalyserNode | null {
  return activeAnalyser
}
