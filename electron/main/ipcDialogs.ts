// The open and save dialogs the IPC handlers show.
import { BrowserWindow, dialog, type IpcMainInvokeEvent, type OpenDialogOptions, type SaveDialogOptions } from 'electron'

// Dialogs are parented to whichever window asked for them. Falls back to an
// unparented dialog if that window is somehow gone by now.
export function showOpenDialog(e: IpcMainInvokeEvent, options: OpenDialogOptions) {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

export function showSaveDialog(e: IpcMainInvokeEvent, options: SaveDialogOptions) {
  const win = BrowserWindow.fromWebContents(e.sender)
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
}
