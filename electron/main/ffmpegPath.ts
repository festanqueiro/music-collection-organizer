import ffmpegPathStatic from 'ffmpeg-static'

// ffmpeg-static resolves its binary path from its own __dirname. Inside a
// packaged (asar) Electron app, that always resolves to the *packed*
// virtual path inside app.asar — even though electron-builder's default
// "smart unpack" heuristic physically extracts native binaries to
// app.asar.unpacked/ on disk — because child_process.spawn() takes the
// path literally and only fs.* calls get Node's automatic asar-unpack
// path redirection. Rewriting app.asar -> app.asar.unpacked before
// spawning is what actually makes the binary runnable in a packaged
// build; in dev/unpacked builds the path never contains "app.asar", so
// this is a no-op there.
export function resolveFfmpegPath(): string | null {
  if (!ffmpegPathStatic) return null
  return ffmpegPathStatic.replace('app.asar', 'app.asar.unpacked')
}
