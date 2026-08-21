import { parentPort } from 'node:worker_threads'
import { runAnalysisPipeline } from './pipeline'

export interface WorkerTask {
  id: number
  path: string
}

export type WorkerResult =
  | { id: number; status: 'done'; result: Awaited<ReturnType<typeof runAnalysisPipeline>> }
  | { id: number; status: 'error' }

if (!parentPort) {
  throw new Error('analysis worker must be run inside a worker_threads Worker')
}

parentPort.on('message', async (task: WorkerTask) => {
  try {
    const result = await runAnalysisPipeline(task.path)
    parentPort!.postMessage({ id: task.id, status: 'done', result } satisfies WorkerResult)
  } catch {
    parentPort!.postMessage({ id: task.id, status: 'error' } satisfies WorkerResult)
  }
})
