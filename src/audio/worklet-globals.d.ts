// The AudioWorkletGlobalScope isn't in TypeScript's DOM lib; these are the
// parts the worklets (recorderWorklet.ts, micWorklet.ts) use.
declare const sampleRate: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void
