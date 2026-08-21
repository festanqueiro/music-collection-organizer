import { parentPort } from 'node:worker_threads'
import { runAnalysisPipeline } from './pipeline'
import { getPlayableFilePath } from '../audioTranscode'

export interface WorkerTask {
  id: number
  path: string
  // Computed on the main thread (needs app.getPath, unavailable here) and
  // handed down so this worker can resolve the same already-transcoded
  // FLAC cache the media:// protocol serves for playback, instead of
  // opening its own independent read of the original source file. See
  // queue.ts's analyzeTrack for the full rationale.
  cacheDir: string
}

export type WorkerResult =
  | { id: number; status: 'done'; result: Awaited<ReturnType<typeof runAnalysisPipeline>> }
  | { id: number; status: 'error' }

if (!parentPort) {
  throw new Error('analysis worker must be run inside a worker_threads Worker')
}

parentPort.on('message', async (task: WorkerTask) => {
  try {
    const playablePath = await getPlayableFilePath(task.path, task.cacheDir)
    const result = await runAnalysisPipeline(playablePath)
    parentPort!.postMessage({ id: task.id, status: 'done', result } satisfies WorkerResult)
  } catch {
    parentPort!.postMessage({ id: task.id, status: 'error' } satisfies WorkerResult)
  }
})
