import { ipcMain, BrowserWindow } from 'electron'
import { PtyManager } from '../services/pty-manager'
import { safeSend } from '../utils/safe-send'

export function registerPtyHandlers(
  ptyManager: PtyManager,
  mainWindow: BrowserWindow
): void {
  ipcMain.handle(
    'pty:create',
    async (_event, { projectId, projectPath, cols, rows }) => {
      try {
        const instance = ptyManager.createPty(projectId, projectPath, cols, rows)

        // Forward PTY output to renderer
        instance.ptyProcess.onData((data: string) => {
          safeSend(mainWindow, `pty:data:${projectId}`, data)
        })

        instance.ptyProcess.onExit(({ exitCode, signal }) => {
          safeSend(mainWindow, `pty:exit:${projectId}`, { exitCode, signal })
        })

        return { id: projectId, success: true }
      } catch (err) {
        console.error(`[PTY] Failed to create PTY for ${projectId}:`, err)
        return {
          id: projectId,
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create PTY'
        }
      }
    }
  )

  ipcMain.handle('pty:write', (_event, { projectId, data }) => {
    return ptyManager.writePty(projectId, data)
  })

  ipcMain.handle('pty:resize', (_event, { projectId, cols, rows }) => {
    ptyManager.resizePty(projectId, cols, rows)
  })

  ipcMain.handle('pty:destroy', (_event, { projectId }) => {
    ptyManager.destroyPty(projectId)
  })

  ipcMain.handle('pty:exists', (_event, { projectId }) => {
    return ptyManager.hasPty(projectId)
  })
}
