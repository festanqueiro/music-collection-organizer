// Mixes every audio source MCO plays — the current track's EffectsChain
// and the Dub Siren, each in its own AudioContext — into the single audio
// track that gets cast. Sources register their cast-tap stream whenever
// they exist (Player registers per track), and are wired into the mix
// only while a cast is running, so this costs nothing otherwise.
const sources = new Map<MediaStream, MediaStreamAudioSourceNode | null>()
let mixer: { context: AudioContext; destination: MediaStreamAudioDestinationNode } | null = null

function connect(stream: MediaStream): void {
  if (!mixer) return
  const node = mixer.context.createMediaStreamSource(stream)
  node.connect(mixer.destination)
  sources.set(stream, node)
}

// Returns an unregister function.
export function registerCastSource(stream: MediaStream): () => void {
  sources.set(stream, null)
  connect(stream)
  return () => {
    sources.get(stream)?.disconnect()
    sources.delete(stream)
  }
}

// Starts mixing and returns the mixed track to record.
export function startCastMixer(): MediaStreamTrack {
  if (!mixer) {
    const context = new AudioContext({ sampleRate: 48000 })
    const destination = context.createMediaStreamDestination()
    // A permanent silent input, so the mix keeps producing audio even when
    // no source is registered (nothing loaded in the Player). Without a
    // steady audio track the recording's audio stalls, the encoder stops
    // cutting segments, and the TV loops the last few seconds.
    const keepAlive = context.createConstantSource()
    keepAlive.offset.value = 0
    keepAlive.connect(destination)
    keepAlive.start()
    mixer = { context, destination }
    for (const stream of sources.keys()) connect(stream)
  }
  mixer.context.resume().catch(() => {})
  return mixer.destination.stream.getAudioTracks()[0]
}

export function stopCastMixer(): void {
  if (!mixer) return
  for (const [stream, node] of sources) {
    node?.disconnect()
    sources.set(stream, null)
  }
  mixer.context.close().catch(() => {})
  mixer = null
}
