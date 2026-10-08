// What went wrong in the main process, as it should be shown: Electron wraps
// an error thrown by a handler as "Error invoking remote method 'x': Error:
// the message".
export function ipcErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
}
