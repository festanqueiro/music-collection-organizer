import { parentPort } from 'node:worker_threads'
import { runAnalysisPipeline } from './pipeline'
import { getPlayableFilePath } from '../audioTranscode'
import { describeAnalysisError } from './errorMessage'
import { decodeToPcm } from './decode'
import { analysedBpm, refineBpm } from './tempoRefine'

// A tempo to sharpen on the audio near `target` (Refine BPM): the same
// decode and measurement the analysis does, without the rest of it.
export interface TempoTask {
  kind: 'tempo'
  id: number
  path: string
  cacheDir: string
  target: number
  // 'near': only sharpened near `target` (a tempo the user multiplied).
  // 'again': measured as analysis would, starting from `target` — 1.5× when
  // two thirds was stored, doubled below `slowestBpm`.
  mode: 'near' | 'again'
  slowestBpm: number | null
}

export interface WorkerTask {
  id: number
  path: string
  // Computed on the main thread (needs app.getPath, unavailable here) and
  // handed down so this worker can resolve the same already-transcoded
  // FLAC cache the media:// protocol serves for playback, instead of
  // opening its own independent read of the original source file. See
  // queue.ts's analyzeTrack for the full rationale.
  cacheDir: string
  // Below it the tempo is doubled (half time); null leaves it.
  slowestBpm: number | null
}

export type WorkerResult =
  | { id: number; status: 'done'; result: Awaited<ReturnType<typeof runAnalysisPipeline>> }
  | { id: number; status: 'error'; message: string }
  // Part-way through a track (see runAnalysisPipeline's onStep).
  | { id: number; status: 'progress'; fraction: number }
  // A TempoTask's answer: null when the audio says nothing clear.
  | { id: number; status: 'tempo'; bpm: number | null }

if (!parentPort) {
  throw new Error('analysis worker must be run inside a worker_threads Worker')
}

parentPort.on('message', async (task: WorkerTask | TempoTask) => {
  if ('kind' in task) {
    let bpm: number | null = null
    try {
      const pcm = await decodeToPcm(await getPlayableFilePath(task.path, task.cacheDir))
      const refined = task.mode === 'again' ? analysedBpm(pcm, task.target, task.slowestBpm) : refineBpm(pcm, task.target, 44100, false)
      bpm = refined === task.target ? null : refined
    } catch (err) {
      console.error('measuring the tempo failed', task.path, err)
    }
    parentPort!.postMessage({ id: task.id, status: 'tempo', bpm } satisfies WorkerResult)
    return
  }
  try {
    const playablePath = await getPlayableFilePath(task.path, task.cacheDir)
    const result = await runAnalysisPipeline(
      playablePath,
      task.path,
      (fraction) => parentPort!.postMessage({ id: task.id, status: 'progress', fraction } satisfies WorkerResult),
      task.slowestBpm
    )
    parentPort!.postMessage({ id: task.id, status: 'done', result } satisfies WorkerResult)
  } catch (err) {
    parentPort!.postMessage({ id: task.id, status: 'error', message: describeAnalysisError(err) } satisfies WorkerResult)
  }
})
