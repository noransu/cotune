import { ipcMain, BrowserWindow } from 'electron'
import { PtyManager } from '../services/pty-manager'

export function registerPtyHandlers(
  ptyManager: PtyManager,
  mainWindow: BrowserWindow
): void {
  ipcMain.handle(
    'pty:create',
    (_event, { projectId, projectPath, cols, rows }) => {
      const instance = ptyManager.createPty(projectId, projectPath, cols, rows)

      // Forward PTY output to renderer
      instance.ptyProcess.onData((data: string) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`pty:data:${projectId}`, data)
        }
      })

      instance.ptyProcess.onExit(({ exitCode, signal }) => {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`pty:exit:${projectId}`, {
            exitCode,
            signal
          })
        }
      })

      return { id: projectId }
    }
  )

  ipcMain.handle('pty:write', (_event, { projectId, data }) => {
    ptyManager.writePty(projectId, data)
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
