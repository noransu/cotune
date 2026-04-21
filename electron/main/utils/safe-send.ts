import { BrowserWindow } from 'electron'

/**
 * Safely send an IPC message to a BrowserWindow's webContents.
 *
 * During app shutdown, there is a race between async callbacks (PTY onData,
 * process stdout, proxy request, etc.) and window destruction. The webContents
 * can be destroyed before the BrowserWindow, so checking `isDestroyed()` on
 * the window alone is insufficient — accessing `webContents` on a destroyed
 * window throws "Object has been destroyed".
 *
 * This utility wraps the send in a try-catch and checks both the window and
 * its webContents before sending.
 */
export function safeSend(
  window: BrowserWindow | null,
  channel: string,
  ...args: unknown[]
): boolean {
  try {
    if (!window || window.isDestroyed()) return false
    const wc = window.webContents
    if (!wc || wc.isDestroyed()) return false
    wc.send(channel, ...args)
    return true
  } catch {
    // Window or webContents was destroyed between checks — ignore
    return false
  }
}
